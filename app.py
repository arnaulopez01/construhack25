import os
import json
import geopandas as gpd
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from shapely.geometry import box
from google import genai
from google.genai import types
import pandas as pd

load_dotenv()

app = Flask(__name__)

# ==============================================================================
# 1. CONFIGURACIÓN Y CARGA DE DATOS
# ==============================================================================

DEFAULT_LAT = 41.31565952544517
DEFAULT_LON = 2.0161933446827933
DEFAULT_ZOOM = 14

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)
MODEL_NAME = "gemini-2.5-flash" # Versión rápida ideal para esto

# Variables globales
gdf_obras = None
gdf_edificios = None
gdf_poblacion = None

def load_geodata():
    global gdf_obras, gdf_edificios, gdf_poblacion
    try:
        gdf_obras = gpd.read_file('static/data/obres.geojson')
        if gdf_obras.crs is None: gdf_obras.set_crs(epsg=4326, inplace=True)
        
        gdf_edificios = gpd.read_file('static/data/edificis.geojson')
        if gdf_edificios.crs is None: gdf_edificios.set_crs(epsg=25831, inplace=True)

        gdf_poblacion = gpd.read_file('static/data/poblacio.geojson')
        if gdf_poblacion.crs is None: gdf_poblacion.set_crs(epsg=4326, inplace=True)
        print("✅ Datos cargados.")
    except Exception as e:
        print(f"❌ Error cargando datos: {e}")

load_geodata()

# ==============================================================================
# 2. FUNCIÓN ESPACIAL (Lógica pura Python)
# ==============================================================================
def ejecutar_analisis_afectacion(nombre_obra: str):
    print(f"⚙️ Procesando análisis para: {nombre_obra}")
    
    # 1. Buscar Obra
    match = gdf_obras[gdf_obras['nombre'].str.contains(nombre_obra, case=False, na=False)]
    if match.empty:
        return None, "No he encontrado ninguna obra con ese nombre."
    
    obra = match.iloc[0]
    
    # 2. Buffer
    geom_utm = gpd.GeoSeries([obra.geometry], crs="EPSG:4326").to_crs(epsg=25831)
    buffer_utm = geom_utm.buffer(30, join_style=2) 
    
    # 3. Intersección 1: BUFFER vs EDIFICIOS
    gdf_buffer = gpd.GeoDataFrame(geometry=buffer_utm, crs="EPSG:25831")
    afec_edificios = gpd.sjoin(gdf_edificios, gdf_buffer, how="inner", predicate="intersects")
    
    # Eliminar columna conflictiva del primer join
    afec_edificios = afec_edificios.drop(columns=['index_right'], errors='ignore')

    # Limpieza de fechas
    for col in afec_edificios.columns:
        if pd.api.types.is_datetime64_any_dtype(afec_edificios[col]):
            afec_edificios[col] = afec_edificios[col].astype(str)

    n_edificios = len(afec_edificios)
    
    # 4. Intersección 2: EDIFICIOS vs POBLACIÓN
    pop_utm = gdf_poblacion.to_crs(epsg=25831)
    
    # Join espacial
    afec_pop = gpd.sjoin(pop_utm, afec_edificios, how="inner", predicate="intersects")
    
    # Suma de población
    afec_pop['estimacioPoblacio'] = pd.to_numeric(afec_pop['estimacioPoblacio'])
    
    # 🔴 CORRECCIÓN 1: Convertir Numpy float a Python float nativo inmediatamente
    total_poblacion = float(afec_pop['estimacioPoblacio'].sum())
    
    print(f"DEBUG: Puntos encontrados: {len(afec_pop)} | Suma total: {total_poblacion}")
    
    # 5. Preparar respuesta
    buffer_wgs84 = buffer_utm.to_crs(epsg=4326)
    edif_wgs84 = afec_edificios.to_crs(epsg=4326)
    
    # 🔴 CORRECCIÓN 2: Convertir los bounds uno a uno a float de Python
    # (GeoPandas devuelve numpy.float64 que rompe el JSON)
    raw_bounds = buffer_wgs84.total_bounds
    bounds = [float(x) for x in raw_bounds]

    map_data = {
        "bounds": bounds,
        "layers": {
            "buffer": json.loads(buffer_wgs84.to_json()),
            "edificios": json.loads(edif_wgs84.to_json())
        }
    }
    
    resumen_texto = (
        f"He analizado la obra <b>{obra['nombre']}</b>.<br><br>"
        f"🔹 <b>Edificios afectados:</b> {n_edificios}<br>"
        f"👥 <b>Población estimada afectada:</b> {int(total_poblacion)} personas<br>"
        f"<small>(Cálculo basado en la suma del padrón en los edificios colindantes)</small>"
    )
    
    return map_data, resumen_texto

# ==============================================================================
# 3. API CHAT (ROUTER PATTERN)
# ==============================================================================

@app.route('/')
def index():
    return render_template('index.html', 
                           maptiler_api_key=os.getenv('MAPTILER_API_KEY', ''),
                           start_lat=DEFAULT_LAT, start_lon=DEFAULT_LON, start_zoom=DEFAULT_ZOOM)

@app.route('/api/chat', methods=['POST'])
def chat():
    user_input = request.json.get('message', '')
    
    # --- A. SYSTEM PROMPT DE CONTROL ---
    # Le enseñamos CÓMO debe devolver el JSON
    system_prompt = """
    Eres un asistente experto en el urbanismo de Viladecans. Tu trabajo es interpretar qué quiere el usuario y estructurar la salida en JSON estricto.
    
    TIENES DOS MODOS DE RESPUESTA:

    1. MODO ANÁLISIS: Si el usuario pregunta por el impacto/afectación de una obra o calle.
       Debes devolver este JSON:
       {
         "intent": "analisis_afectacion",
         "activar_funcion": true,
         "parametros": {
             "nombre_obra": "nombre extraído del texto"
         },
         "respuesta_texto": "Analizando la zona..."
       }

    2. MODO CHAT: Para cualquier otra pregunta o saludo.
       Debes devolver este JSON:
       {
         "intent": "chat_general",
         "activar_funcion": false,
         "parametros": {},
         "respuesta_texto": "Tu respuesta amable aquí."
       }
    
    Nombres de las obras activas en viladecans:

    "Peatonalización y Mejora de Accesibilidad Rambla Modolell"
    "Renaturalización y Nuevo Parque Infantil Plaça Saint Herblain"
    "Nueva vivienda social - Barri de Llevant"

    Si el usuario pregunta por alguna de estas obras o nombres parecidos, pon el nombre correspondiente en el campo nombre_obra.



    IMPORTANTE: Responde SOLAMENTE con el JSON, sin bloques de código markdown.
    """

    try:
        # --- B. LLAMADA A GEMINI (OUTPUT JSON) ---
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=user_input,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json", # Forzamos JSON Mode
                temperature=0.1
            )
        )
        
        # --- C. PARSEO Y EJECUCIÓN MANUAL ---
        # Convertimos la respuesta de texto (que es un JSON string) a diccionario Python
        llm_data = json.loads(response.text)
        
        final_response_text = llm_data.get("respuesta_texto", "")
        map_payload = None
        action_type = None

        # Si el LLM ha decidido activar la función (flag a True)
        if llm_data.get("activar_funcion") is True:
            intent = llm_data.get("intent")
            
            if intent == "analisis_afectacion":
                obra_name = llm_data["parametros"].get("nombre_obra")
                
                # EJECUTAMOS NUESTRA LÓGICA PYTHON
                datos_mapa, mensaje_resultado = ejecutar_analisis_afectacion(obra_name)
                
                if datos_mapa:
                    map_payload = datos_mapa
                    # Sobrescribimos la respuesta del LLM con los datos reales calculados
                    final_response_text = mensaje_resultado
                    action_type = "update_map"
                else:
                    final_response_text = mensaje_resultado # Mensaje de error si no encontró la obra

        # --- D. RESPUESTA AL FRONTEND ---
        return jsonify({
            "response": final_response_text,
            "action": action_type,
            "data": map_payload
        })

    except Exception as e:
        print(f"Error backend: {e}")
        return jsonify({"response": "Error interno procesando tu solicitud."}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)