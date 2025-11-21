import os
import json
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

DEFAULT_LAT = 41.31565952544517
DEFAULT_LON = 2.0161933446827933
DEFAULT_ZOOM = 12

@app.route('/')
def index():
    maptiler_key = os.getenv('MAPTILER_API_KEY', '')
    return render_template('index.html', 
                           maptiler_api_key=maptiler_key,
                           start_lat=DEFAULT_LAT,
                           start_lon=DEFAULT_LON,
                           start_zoom=DEFAULT_ZOOM)

if __name__ == '__main__':
    app.run(debug=True)