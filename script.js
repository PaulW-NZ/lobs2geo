class LOBProcessor {
    constructor() {
        this.map = null;
        this.mapLayers = {};
        this.activeMapLayer = null;
        this.lobs = [];
        this.markers = [];
        this.polylines = [];
        this.ellipse = null;
        this.intersectionMarkers = [];
        this.manualLobs = [];
        this.isDrawing = false;
        this.startPoint = null;
        this.tempMarker = null;
        this.tempPolyline = null;
        this.meanLocationMarker = null;
        this.currentResults = null;

        this.initMap();
        this.bindEvents();
    }

    initMap() {
        this.map = L.map('map').setView([0, 0], 2);

        this.mapLayers = {
            'carto-dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CartoDB', maxZoom: 20 }),
            'carto-light': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CartoDB', maxZoom: 20 }),
            'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }),
            'satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri', maxZoom: 20 })
        };

        this.activeMapLayer = this.mapLayers['osm'];
        this.activeMapLayer.addTo(this.map);

        L.control.scale().addTo(this.map);
    }

    bindEvents() {
        document.getElementById('processButton').addEventListener('click', () => this.processFile());
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('map-style-select').addEventListener('change', (e) => this.switchMapStyle(e.target.value));
        document.getElementById('confidence-level-select').addEventListener('change', () => this.reprocessLobs());
        document.getElementById('max-lob-distance').addEventListener('change', () => this.reprocessLobs());
        document.getElementById('clear-all-data').addEventListener('click', () => this.clearAllData());
        document.getElementById('addLobButton').addEventListener('click', () => this.addManualLob());
        document.getElementById('drawLobButton').addEventListener('click', () => this.toggleDrawMode());
        document.getElementById('processManualButton').addEventListener('click', () => this.processManualLobs());
        document.getElementById('toggle-lobs').addEventListener('change', (e) => this.toggleLOBs(e.target.checked));
        document.getElementById('toggle-markers').addEventListener('change', (e) => this.toggleMarkers(e.target.checked));
        document.getElementById('toggle-intersections').addEventListener('change', (e) => this.toggleIntersections(e.target.checked));
        document.getElementById('toggle-ellipse').addEventListener('change', (e) => this.toggleEllipse(e.target.checked));
        document.getElementById('exportButton').addEventListener('click', () => this.exportResults());
        document.getElementById('exportKmlButton').addEventListener('click', () => this.exportKML());

        const tabLinks = document.querySelectorAll('.tab-link');
        for (const link of tabLinks) {
            link.addEventListener('click', (e) => this.openTab(e, e.currentTarget.dataset.tab));
        }

        // Initialize the default active tab
        const defaultTabLink = document.querySelector('.tab-link.active');
        if (defaultTabLink) {
            this.openTab({ currentTarget: defaultTabLink }, defaultTabLink.dataset.tab);
        }

        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.addEventListener('change', (e) => {
                if (e.target.matches('.lob-checkbox')) {
                    this.reprocessLobs();
                }
            });
        }
    }

    openTab(evt, tabName) {
        var i, tabcontent, tablinks;
        tabcontent = document.getElementsByClassName("tab-content");
        for (i = 0; i < tabcontent.length; i++) {
            tabcontent[i].style.display = "none";
        }
        tablinks = document.getElementsByClassName("tab-link");
        for (i = 0; i < tablinks.length; i++) {
            tablinks[i].className = tablinks[i].className.replace(" active", "");
        }
        document.getElementById(tabName).style.display = "block";
        evt.currentTarget.className += " active";
    }

    exportResults() {
        let exportContent = '';

        // Add LOB data
        if (this.lobs.length > 0) {
            exportContent += '--- LOB Data ---\n';
            this.lobs.forEach((lob, index) => {
                exportContent += `LOB ${index + 1}: Lat: ${lob.latitude.toFixed(8)}, Lon: ${lob.longitude.toFixed(8)}, Brng: ${lob.lob.toFixed(2)}°\n`;
            });
            exportContent += '\n';
        }

        // Add processed results
        const resultsText = document.getElementById('results').value;
        if (resultsText) {
            exportContent += '--- Processed Results ---\n';
            exportContent += resultsText;
        } else {
            exportContent += 'No processed results available.\n';
        }

        if (exportContent) {
            const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'lob_results.txt'; // Change filename
            a.click();
        } else {
            alert('No data to export.');
        }
    }

    exportKML() {
        if (!this.currentResults || !this.lobs || this.lobs.length === 0) {
            alert('No data to export to KML.');
            return;
        }

        let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        kmlContent += `<kml xmlns="http://www.opengis.net/kml/2.2">\n`;
        kmlContent += `  <Document>\n`;
        kmlContent += `    <name>LOB Results</name>\n`;
        kmlContent += `    <description>Lines of Bearing and Intersection Results</description>\n\n`;

        // Styles
        kmlContent += `    <Style id="lobStyle">\n`;
        kmlContent += `      <LineStyle>\n`;
        kmlContent += `        <color>ff0000ff</color>\n`; // Opaque blue (AABBGGRR) - Leaflet default blue is #0000FF
        kmlContent += `        <width>3</width>\n`;
        kmlContent += `      </LineStyle>\n`;
        kmlContent += `    </Style>\n`;
        kmlContent += `    <Style id="intersectionStyle">\n`;
        kmlContent += `      <IconStyle>\n`;
        kmlContent += `        <Icon>\n`;
        kmlContent += `          <href>http://maps.google.com/mapfiles/kml/pushpin/red-pushpin.png</href>\n`;
        kmlContent += `        </Icon>\n`;
        kmlContent += `        <scale>1.1</scale>\n`;
        kmlContent += `      </IconStyle>\n`;
        kmlContent += `    </Style>\n`;
        kmlContent += `    <Style id="ellipseStyle">\n`;
        kmlContent += `      <LineStyle>\n`;
        kmlContent += `        <color>ff0000ff</color>\n`; // Opaque blue
        kmlContent += `        <width>2</width>\n`;
        kmlContent += `      </LineStyle>\n`;
        kmlContent += `      <PolyStyle>\n`;
        kmlContent += `        <color>800000ff</color>\n`; // 50% opaque blue
        kmlContent += `      </PolyStyle>\n`;
        kmlContent += `    </Style>\n\n`;

        // LOBs
        this.lobs.forEach((lob, index) => {
            const p1 = [lob.latitude, lob.longitude]; // Leaflet is lat,lon
            const lobLengthMeters = parseFloat(document.getElementById('lobLengthInput').value) * 1000; // Assuming this is the desired length for KML
            const p2 = this.destVincenty(lob.latitude, lob.longitude, lob.lob, lobLengthMeters);

            if (p2) {
                kmlContent += `    <Placemark>\n`;
                kmlContent += `      <name>LOB ${index + 1}</name>\n`;
                kmlContent += `      <styleUrl>#lobStyle</styleUrl>\n`;
                kmlContent += `      <LineString>\n`;
                kmlContent += `        <coordinates>\n`;
                kmlContent += `          ${p1[1]},${p1[0]},0 ${p2[1]},${p2[0]},0\n`; // KML is lon,lat,alt
                kmlContent += `        </coordinates>\n`;
                kmlContent += `      </LineString>\n`;
                kmlContent += `    </Placemark>\n`;
            }
        });

        // Mean Intersection Point
        if (this.currentResults.meanLat && this.currentResults.meanLon) {
            kmlContent += `    <Placemark>\n`;
            kmlContent += `      <name>Mean Intersection</name>\n`;
            kmlContent += `      <styleUrl>#intersectionStyle</styleUrl>\n`;
            kmlContent += `      <Point>\n`;
            kmlContent += `        <coordinates>\n`;
            kmlContent += `          ${this.currentResults.meanLon},${this.currentResults.meanLat},0\n`;
            kmlContent += `        </coordinates>\n`;
            kmlContent += `      </Point>\n`;
            kmlContent += `    </Placemark>\n`;
        }

        // Error Ellipse
        if (this.currentResults.halfmajoraxissize && this.currentResults.halfminoraxissize && this.currentResults.angle) {
            const meanLatLng = [this.currentResults.meanLat, this.currentResults.meanLon];
            const halfmajoraxissizeMeters = this.currentResults.halfmajoraxissize * 111320; // Convert degrees to meters (approx)
            const halfminoraxissizeMeters = this.currentResults.halfminoraxissize * 111320; // Convert degrees to meters (approx)
            const ellipsePoints = this.getEllipsePoints(meanLatLng, halfmajoraxissizeMeters, halfminoraxissizeMeters, this.currentResults.angle);

            if (ellipsePoints.length > 0) {
                kmlContent += `    <Placemark>\n`;
                kmlContent += `      <name>Error Ellipse</name>\n`;
                kmlContent += `      <styleUrl>#ellipseStyle</styleUrl>\n`;
                kmlContent += `      <Polygon>\n`;
                kmlContent += `        <outerBoundaryIs>\n`;
                kmlContent += `          <LinearRing>\n`;
                kmlContent += `            <coordinates>\n`;
                ellipsePoints.forEach(point => {
                    kmlContent += `              ${point[1]},${point[0]},0\n`; // KML is lon,lat,alt
                });
                kmlContent += `            </coordinates>\n`;
                kmlContent += `          </LinearRing>\n`;
                kmlContent += `        </outerBoundaryIs>\n`;
                kmlContent += `      </Polygon>\n`;
                kmlContent += `    </Placemark>\n`;
            }
        }

        kmlContent += `  </Document>\n`;
        kmlContent += `</kml>`;

        const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'lob_results.kml';
        a.click();
    }

    toggleLOBs(show) {
        for (const polyline of this.polylines) {
            if (show) {
                polyline.addTo(this.map);
            } else {
                this.map.removeLayer(polyline);
            }
        }
    }

    toggleMarkers(show) {
        for (const marker of this.markers) {
            if (show) {
                marker.addTo(this.map);
            } else {
                this.map.removeLayer(marker);
            }
        }
    }

    toggleIntersections(show) {
        for (const marker of this.intersectionMarkers) {
            if (show) {
                marker.addTo(this.map);
            } else {
                this.map.removeLayer(marker);
            }
        }
    }

    toggleEllipse(show) {
        if (this.ellipse) {
            if (show) {
                this.ellipse.addTo(this.map);
            } else {
                this.map.removeLayer(this.ellipse);
            }
        }
    }

    processFile() {
        const file = document.getElementById('fileInput').files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.clearAllData();
                this.lobs = this.parseLOBs(e.target.result);
                if (this.lobs.length > 0) {
                    const results = this.processLOBs(this.lobs);
                    this.displayResults(results, this.lobs);
                    // Update the app title with the file name
                    document.querySelector('.app-title').textContent = `LOB Processor - ${file.name}`;
                } else {
                    alert('No LOBs found in the file.');
                }
            };
            reader.readAsText(file);
        }
    }

    addManualLob() {
        const lat = parseFloat(document.getElementById('latInput').value);
        const lon = parseFloat(document.getElementById('lonInput').value);
        const bearing = parseFloat(document.getElementById('bearingInput').value);

        if (!isNaN(lat) && !isNaN(lon) && !isNaN(bearing)) {
            this.manualLobs.push({ latitude: lat, longitude: lon, lob: bearing, altitude: 0, loe: 0, obj_id: 0, prob: 1, track_id: 0 });
            document.getElementById('latInput').value = '';
            document.getElementById('lonInput').value = '';
            document.getElementById('bearingInput').value = '';
        } else {
            alert('Invalid input. Please enter valid numbers for Latitude, Longitude, and Bearing.');
        }
    }

    processManualLobs() {
        if (this.manualLobs.length > 0) {
            this.clearMapAndResults();
            this.lobs = this.manualLobs;
            const results = this.processLOBs(this.lobs);
            this.displayResults(results, this.lobs);
        } else {
            alert('No manual LOBs to process. Please add some LOBs first.');
        }
    }

    reprocessLobs() {
        // Update the 'enabled' state of each LOB based on its checkbox
        const checkboxes = document.querySelectorAll('.lob-checkbox');
        checkboxes.forEach(checkbox => {
            const index = parseInt(checkbox.dataset.lobIndex);
            if (this.lobs[index]) {
                this.lobs[index].enabled = checkbox.checked;
            }
        });

        // Filter for currently enabled LOBs
        const selectedLobs = this.lobs.filter(lob => lob.enabled);

        this.clearMap();

        if (selectedLobs.length > 1) {
            const results = this.processLOBs(selectedLobs);
            this.displayResults(results, selectedLobs);
        } else {
            document.getElementById('results').value = 'Please select at least two LOBs to process.';
            // Also clear the map if not enough LOBs are selected
            this.clearMap();
        }
    }

    parseLOBs(text) {
        const lobs = [];
        const lines = text.split('\n');
        for (const line of lines) {
            const parts = line.split(/\s+/);
            if (parts.length >= 16 && parts[0] === 'Lat:') {
                lobs.push({
                    latitude: parseFloat(parts[1]),
                    longitude: parseFloat(parts[3]),
                    altitude: parseFloat(parts[5]),
                    lob: parseFloat(parts[7]),
                    loe: parseFloat(parts[9]),
                    obj_id: parseInt(parts[11]),
                    prob: parseFloat(parts[13]),
                    track_id: parseInt(parts[15])
                });
            }
        }
        return lobs;
    }

    processLOBs(lobs) {
        const intersections = [];
        const maxLobIntersectionDistance = parseFloat(document.getElementById('max-lob-distance').value) * 1000; // Read from UI and convert to meters

        for (let i = 0; i < lobs.length; i++) {
            for (let j = i + 1; j < lobs.length; j++) {
                const intersection = this.geoIntersection(lobs[i].latitude, lobs[i].longitude, lobs[i].lob, lobs[j].latitude, lobs[j].longitude, lobs[j].lob);

                if (intersection) {
                    // Calculate distance from LOB1 start to intersection
                    const dist13 = this.getDistance(lobs[i].latitude, lobs[i].longitude, intersection.lat, intersection.lon);
                    // Calculate distance from LOB2 start to intersection
                    const dist23 = this.getDistance(lobs[j].latitude, lobs[j].longitude, intersection.lat, intersection.lon);

                    if (dist13 <= maxLobIntersectionDistance && dist23 <= maxLobIntersectionDistance) {
                        intersections.push(intersection);
                    }
                }
            }
        }

        if (intersections.length === 0) {
            return { error: 'No intersections found.' };
        }

        const crossLat = intersections.map(p => p.lat * 100000);
        const crossLon = intersections.map(p => p.lon * 100000);

        const meanLat = math.mean(crossLat);
        const meanLon = math.mean(crossLon);

        const varLat = math.variance(crossLat);
        const varLon = math.variance(crossLon);
        const covLatLon = this.covariance(crossLat, crossLon);

        const n = intersections.length;
        const covmat = [[varLat / n, covLatLon / n], [covLatLon / n, varLon / n]];
        const { values, vectors } = math.eigs(covmat);

        const angle = Math.atan2(vectors[0][1], vectors[0][0]);
        const angleDeg = angle * 180 / Math.PI;

        const chisquare_val = parseFloat(document.getElementById('confidence-level-select').value);
        const halfmajoraxissize = chisquare_val * Math.sqrt(values[0]);
        const halfminoraxissize = chisquare_val * Math.sqrt(values[1]);

        return {
            meanLat: meanLat / 100000,
            meanLon: meanLon / 100000,
            varLat,
            varLon,
            covLatLon,
            angle: angleDeg,
            halfmajoraxissize: halfmajoraxissize / 100000,
            halfminoraxissize: halfminoraxissize / 100000,
            intersections: intersections
        };
    }

    clearMap() {
        this.map.eachLayer(layer => {
            // Assuming the base tile layer is stored in this.activeMapLayer
            // and we don't want to remove it.
            if (layer !== this.activeMapLayer) {
                this.map.removeLayer(layer);
            }
        });

        // Reset all internal references
        this.markers = [];
        this.polylines = [];
        this.ellipse = null;
        this.intersectionMarkers = [];
        this.meanLocationMarker = null;
        this.tempMarker = null;
        this.tempPolyline = null;

        // Explicitly close all tooltips on the map (redundant if layers are removed, but safe)
        this.map.eachLayer(layer => {
            if (layer.getTooltip && layer.getTooltip()) {
                layer.closeTooltip();
            }
        });
    }

    clearMapAndResults() {
        this.clearMap();
        document.getElementById('results').value = '';
        document.getElementById('lob-list').innerHTML = '';
    }

    displayOnMap(results, lobs) {
        this.clearMap();
        this.map.setView([results.meanLat, results.meanLon], 13);

        // Draw LOBs and markers
        const showLOBs = document.getElementById('toggle-lobs').checked;
        const showMarkers = document.getElementById('toggle-markers').checked;
        for (const lob of lobs) {
            const p1 = [lob.latitude, lob.longitude];
            const p2 = this.destVincenty(lob.latitude, lob.longitude, lob.lob, 10000); // 10km line
            const polyline = L.polyline([p1, p2], { color: 'blue' });
            if (showLOBs) {
                polyline.addTo(this.map);
            }
            this.polylines.push(polyline);

            const marker = L.marker(p1);
            if (showMarkers) {
                marker.addTo(this.map);
            }
            marker.bindTooltip(`Lat: ${lob.latitude.toFixed(8)}<br>Lon: ${lob.longitude.toFixed(8)}<br>Alt: ${lob.altitude}<br>LOB: ${lob.lob}<br>LOE: ${lob.loe}<br>ID: ${lob.obj_id}<br>Prob: ${lob.prob}<br>Track ID: ${lob.track_id}`);
            this.markers.push(marker);
        }

        // Draw mean location and ellipse
        const meanLatLng = [results.meanLat, results.meanLon];
        if (!isNaN(meanLatLng[0]) && !isNaN(meanLatLng[1])) {
            // If there was a previous marker, remove it before creating a new one
            if (this.meanLocationMarker) {
                this.map.removeLayer(this.meanLocationMarker);
            }
            this.meanLocationMarker = L.circleMarker(meanLatLng, { radius: 5, color: 'red', fillColor: '#f03', fillOpacity: 0.5 }).addTo(this.map);
        } else {
            // If meanLatLng is invalid, ensure the marker is cleared
            if (this.meanLocationMarker) {
                this.map.removeLayer(this.meanLocationMarker);
                this.meanLocationMarker = null;
            }
        }

        const halfmajoraxissizeMeters = results.halfmajoraxissize * 111320;
        const halfminoraxissizeMeters = results.halfminoraxissize * 111320;
        const ellipsePoints = this.getEllipsePoints(meanLatLng, halfmajoraxissizeMeters, halfminoraxissizeMeters, results.angle);
        this.ellipse = L.polygon(ellipsePoints, { color: 'blue', fillColor: 'lightblue', fillOpacity: 0.5 });
        if (document.getElementById('toggle-ellipse').checked) {
            this.ellipse.addTo(this.map);
        }

        // Draw intersections
        if (results.intersections) {
            const showIntersections = document.getElementById('toggle-intersections').checked;
            for (const intersection of results.intersections) {
                const marker = L.circleMarker([intersection.lat, intersection.lon], { radius: 3, color: 'green' });
                if (showIntersections) {
                    marker.addTo(this.map);
                }
                this.intersectionMarkers.push(marker);
            }
        }
    }

    displayResults(results, lobs) {
        this.displayOnMap(results, lobs);
        this.updateLobList(); // Call to update the LOBs tab
        this.currentResults = results; // Store results

        const resultsText = document.getElementById('results');
        if (results.error) {
            resultsText.value = results.error;
            return;
        }

        if (Object.keys(results).length > 0 && lobs.length > 1) {
            const halfmajoraxissizeMeters = results.halfmajoraxissize * 111320;
            const halfminoraxissizeMeters = results.halfminoraxissize * 111320;

            resultsText.value = `Mean Latitude: ${results.meanLat.toFixed(8)}\n` +
                                `Mean Longitude: ${results.meanLon.toFixed(8)}\n` +
                                `Variance Latitude: ${results.varLat.toFixed(8)}\n` +
                                `Variance Longitude: ${results.varLon.toFixed(8)}\n` +
                                `Covariance: ${results.covLatLon.toFixed(8)}\n` +
                                `Ellipse Angle: ${results.angle.toFixed(2)} degrees\n` +
                                `Ellipse Major Axis: ${results.halfmajoraxissize.toFixed(8)} degrees (${halfmajoraxissizeMeters.toFixed(2)} meters)\n` +
                                `Ellipse Minor Axis: ${results.halfminoraxissize.toFixed(8)} degrees (${halfminoraxissizeMeters.toFixed(2)} meters)`;
        } else if (lobs.length <= 1) {
            resultsText.value = 'Please select at least two LOBs to process.';
        }
    }

    getEllipsePoints(center, majorAxis, minorAxis, angle) {
        const points = [];
        for (let i = 0; i <= 360; i++) {
            const angleRad = i * Math.PI / 180;
            const x = majorAxis * Math.cos(angleRad);
            const y = minorAxis * Math.sin(angleRad);
            const rotated = this.rotate(x, y, angle);
            const point = this.destinationPoint(center, rotated.x, rotated.y);
            points.push(point);
        }
        return points;
    }

    rotate(x, y, angle) {
        const angleRad = angle * Math.PI / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        return {
            x: x * cos - y * sin,
            y: x * sin + y * cos
        };
    }

    destinationPoint(start, x, y) {
        const R = 6378137; // Earth's radius in meters
        const lat1 = this.toRadians(start[0]);
        const lon1 = this.toRadians(start[1]);

        const lat2 = lat1 + this.toRadians(y / R * 180 / Math.PI);
        const lon2 = lon1 + this.toRadians(x / (R * Math.cos(lat1)) * 180 / Math.PI);

        return [this.toDegrees(lat2), this.toDegrees(lon2)];
    }

    geoIntersection(lat1, lon1, brng1, lat2, lon2, brng2) {
        // Convert to radians
        lat1 = this.toRadians(lat1); lon1 = this.toRadians(lon1);
        lat2 = this.toRadians(lat2); lon2 = this.toRadians(lon2);
        brng1 = this.toRadians(brng1); brng2 = this.toRadians(brng2);

        const R = 6371e3; // Earth's radius in metres

        const dLat = lat2 - lat1;
        const dLon = lon2 - lon1;

        const dist12 = 2 * Math.asin(Math.sqrt(Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)));
        if (dist12 == 0) return null;

        // initial/final bearings between points 1 & 2
        let brngA = Math.acos((Math.sin(lat2) - Math.sin(lat1) * Math.cos(dist12)) /
            (Math.sin(dist12) * Math.cos(lat1)));
        if (isNaN(brngA)) brngA = 0; // protect against rounding
        const brngB = Math.acos((Math.sin(lat1) - Math.sin(lat2) * Math.cos(dist12)) /
            (Math.sin(dist12) * Math.cos(lat2)));

        const brng12 = (Math.sin(lon2 - lon1) > 0) ? brngA : 2 * Math.PI - brngA;
        const brng21 = (Math.sin(lon1 - lon2) > 0) ? brngB : 2 * Math.PI - brngB;

        const alpha1 = (brng1 - brng12 + Math.PI) % (2 * Math.PI) - Math.PI; // angle 2-1-3
        const alpha2 = (brng21 - brng2 + Math.PI) % (2 * Math.PI) - Math.PI; // angle 1-2-3

        if (Math.sin(alpha1) == 0 && Math.sin(alpha2) == 0) return null; // infinite intersections
        if (Math.sin(alpha1) * Math.sin(alpha2) < 0) return null;      // ambiguous intersection

        const alpha3 = Math.acos(-Math.cos(alpha1) * Math.cos(alpha2) +
            Math.sin(alpha1) * Math.sin(alpha2) * Math.cos(dist12));

        const numerator = Math.sin(dist12) * Math.sin(alpha1) * Math.sin(alpha2);
        const denominator = Math.cos(alpha2) + Math.cos(alpha1) * Math.cos(alpha3);

        // If denominator is very close to zero, the intersection is ill-defined or very far away
        if (Math.abs(denominator) < 1e-12) { // A small epsilon value
            return null;
        }

        const dist13 = R * Math.atan2(numerator, denominator);

        const lat3 = Math.asin(Math.sin(lat1) * Math.cos(dist13 / R) +
            Math.cos(lat1) * Math.sin(dist13 / R) * Math.cos(brng1));
        const dLon13 = Math.atan2(Math.sin(brng1) * Math.sin(dist13 / R) * Math.cos(lat1),
            Math.cos(dist13 / R) - Math.sin(lat1) * Math.sin(lat3));
        const lon3 = lon1 + dLon13;

        return { lat: this.toDegrees(lat3), lon: (this.toDegrees(lon3) + 540) % 360 - 180 };
    }

    toRadians(deg) {
        return deg * Math.PI / 180;
    }

    toDegrees(rad) {
        return rad * 180 / Math.PI;
    }

    covariance(arr1, arr2) {
        const mean1 = math.mean(arr1);
        const mean2 = math.mean(arr2);
        let cov = 0;
        for (let i = 0; i < arr1.length; i++) {
            cov += (arr1[i] - mean1) * (arr2[i] - mean2);
        }
        return cov / (arr1.length - 1);
    }

    getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        lat1 = this.toRadians(lat1);
        lon1 = this.toRadians(lon1);
        lat2 = this.toRadians(lat2);
        lon2 = this.toRadians(lon2);

        const dLat = lat2 - lat1;
        const dLon = lon2 - lon1;

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // distance in meters
    }

    updateLobList() {
        const lobListDiv = document.getElementById('lob-list');
        lobListDiv.innerHTML = ''; // Clear existing list

        if (this.lobs.length === 0) {
            lobListDiv.innerHTML = '<p>No LOBs to display.</p>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'lob-table'; // Add a class for styling

        // Create table header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <th></th> <!-- Checkbox column -->
            <th>Lat</th>
            <th>Lon</th>
            <th>Brng</th>
        `;
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create table body
        const tbody = document.createElement('tbody');
        this.lobs.forEach((lob, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="checkbox" class="lob-checkbox" data-lob-index="${index}" ${lob.enabled !== false ? 'checked' : ''}></td>
                <td>${lob.latitude.toFixed(5)}</td>
                <td>${lob.longitude.toFixed(5)}</td>
                <td>${lob.lob.toFixed(2)}°</td>
            `;
            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        lobListDiv.appendChild(table);
    }

    destVincenty(lat1, lon1, brng, dist) {
        lat1 = this.toRadians(lat1);
        lon1 = this.toRadians(lon1);
        brng = this.toRadians(brng);

        const a = 6378137, b = 6356752.3142, f = 1 / 298.257223563;  // WGS-84 ellipsoid params
        const s = dist;
        const sinAlpha1 = Math.sin(brng);
        const cosAlpha1 = Math.cos(brng);

        const tanU1 = (1 - f) * Math.tan(lat1);
        const cosU1 = 1 / Math.sqrt((1 + tanU1 * tanU1)), sinU1 = tanU1 * cosU1;
        const sigma1 = Math.atan2(tanU1, cosAlpha1);
        const sinAlpha = cosU1 * sinAlpha1;
        const cosSqAlpha = 1 - sinAlpha * sinAlpha;
        const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
        const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
        const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

        let sigma = s / (b * A), sigmaP = 2 * Math.PI;
        let cos2SigmaM, sinSigma, cosSigma, deltaSigma;
        do {
            cos2SigmaM = Math.cos(2 * sigma1 + sigma);
            sinSigma = Math.sin(sigma);
            cosSigma = Math.cos(sigma);
            deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
            sigmaP = sigma;
            sigma = s / (b * A) + deltaSigma;
        } while (Math.abs(sigma - sigmaP) > 1e-12);

        const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
        const lat2 = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1, (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp));
        const lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1);
        const C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
        const L = lambda - (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));

        const lon2 = (lon1 + L + 3 * Math.PI) % (2 * Math.PI) - Math.PI;  // normalise to -180..+180

        return [this.toDegrees(lat2), this.toDegrees(lon2)];
    }

    switchMapStyle(style) {
        if (this.activeMapLayer) {
            this.map.removeLayer(this.activeMapLayer);
        }
        this.activeMapLayer = this.mapLayers[style];
        this.activeMapLayer.addTo(this.map);

        const mapElement = document.getElementById('map');
        if (style === 'carto-dark') {
            mapElement.style.filter = 'var(--map-filter)';
        } else {
            mapElement.style.filter = 'none';
        }
    }

    toggleTheme() {
        const body = document.body;
        const toggleButton = document.getElementById('theme-toggle');
        const mapSelect = document.getElementById('map-style-select');
        body.classList.toggle('light-mode');

        if (body.classList.contains('light-mode')) {
            if (mapSelect.value === 'carto-dark') {
                mapSelect.value = 'carto-light';
                this.switchMapStyle('carto-light');
            }
            toggleButton.innerHTML = '<span>🌙</span>';
        } else {
            if (mapSelect.value === 'carto-light') {
                mapSelect.value = 'carto-dark';
                this.switchMapStyle('carto-dark');
            }
            toggleButton.innerHTML = '<span>☀️</span>';
        }
    }

    clearAllData() {
        this.clearMap(); // Clear all map layers
        this.lobs = [];
        this.manualLobs = [];
        document.getElementById('results').value = '';
        document.getElementById('lob-list').innerHTML = '';
        // Ensure all internal references are nullified
        this.meanLocationMarker = null;
        this.tempMarker = null;
        this.tempPolyline = null;
        this.startPoint = null;
        this.isDrawing = false; // Reset drawing state
        // Also reset the draw button text if it's in 'Cancel Drawing' state
        const drawButton = document.getElementById('drawLobButton');
        if (drawButton.textContent === 'Cancel Drawing') {
            drawButton.textContent = 'Draw LOB';
            drawButton.classList.remove('btn-danger');
            this.map.off('click', this.onMapClick, this);
            this.map.off('mousemove', this.onMapMousemove, this);
            this.map.getContainer().style.cursor = '';
        }
    }



    displayOnMap(results, lobs) {
        this.clearMap();
        this.map.setView([results.meanLat, results.meanLon], 13);

        // Draw LOBs and markers
        const showLOBs = document.getElementById('toggle-lobs').checked;
        const showMarkers = document.getElementById('toggle-markers').checked;
        for (const lob of lobs) {
            const p1 = [lob.latitude, lob.longitude];
            const p2 = this.destVincenty(lob.latitude, lob.longitude, lob.lob, 10000); // 10km line
            const polyline = L.polyline([p1, p2], { color: 'blue' });
            if (showLOBs) {
                polyline.addTo(this.map);
            }
            this.polylines.push(polyline);

            const marker = L.marker(p1);
            if (showMarkers) {
                marker.addTo(this.map);
            }
            marker.bindTooltip(`Lat: ${lob.latitude.toFixed(8)}<br>Lon: ${lob.longitude.toFixed(8)}<br>Alt: ${lob.altitude}<br>LOB: ${lob.lob}<br>LOE: ${lob.loe}<br>ID: ${lob.obj_id}<br>Prob: ${lob.prob}<br>Track ID: ${lob.track_id}`);
            this.markers.push(marker);
        }

        // Draw mean location and ellipse
        const meanLatLng = [results.meanLat, results.meanLon];
        L.circleMarker(meanLatLng, { radius: 5, color: 'red', fillColor: '#f03', fillOpacity: 0.5 }).addTo(this.map);

        const halfmajoraxissizeMeters = results.halfmajoraxissize * 111320;
        const halfminoraxissizeMeters = results.halfminoraxissize * 111320;
        const ellipsePoints = this.getEllipsePoints(meanLatLng, halfmajoraxissizeMeters, halfminoraxissizeMeters, results.angle);
        this.ellipse = L.polygon(ellipsePoints, { color: 'blue', fillColor: 'lightblue', fillOpacity: 0.5 });
        if (document.getElementById('toggle-ellipse').checked) {
            this.ellipse.addTo(this.map);
        }

        // Draw intersections
        if (results.intersections) {
            const showIntersections = document.getElementById('toggle-intersections').checked;
            for (const intersection of results.intersections) {
                const marker = L.circleMarker([intersection.lat, intersection.lon], { radius: 3, color: 'green' });
                if (showIntersections) {
                    marker.addTo(this.map);
                }
                this.intersectionMarkers.push(marker);
            }
        }
    }

    toggleLOBs(show) {
        for (const polyline of this.polylines) {
            if (show) {
                polyline.addTo(this.map);
            } else {
                this.map.removeLayer(polyline);
            }
        }
    }

    toggleMarkers(show) {
        for (const marker of this.markers) {
            if (show) {
                marker.addTo(this.map);
            } else {
                this.map.removeLayer(marker);
            }
        }
    }

    toggleDrawMode() {
        this.isDrawing = !this.isDrawing;
        const drawButton = document.getElementById('drawLobButton');
        if (this.isDrawing) {
            drawButton.textContent = 'Cancel Drawing';
            drawButton.classList.add('btn-danger');
            this.map.on('click', this.onMapClick, this);
            this.map.getContainer().style.cursor = 'crosshair';
        } else {
            drawButton.textContent = 'Draw LOB';
            drawButton.classList.remove('btn-danger');
            this.map.off('click', this.onMapClick, this);
            this.map.off('mousemove', this.onMapMousemove, this);
            this.map.getContainer().style.cursor = '';
            if (this.tempMarker) {
                this.tempMarker.closeTooltip();
                this.map.removeLayer(this.tempMarker);
                this.tempMarker = null; // Set to null after removal
            }
            if (this.tempPolyline) {
                this.map.removeLayer(this.tempPolyline);
                this.tempPolyline = null; // Set to null after removal
            }
            this.startPoint = null;
        }
    }

    onMapClick(e) {
        if (!this.startPoint) {
            // First click: define the start point
            this.startPoint = e.latlng;
            this.tempMarker = L.marker(this.startPoint).addTo(this.map);
            this.map.on('mousemove', this.onMapMousemove, this);
        } else {
            // Second click: finalize the LOB
            const endPoint = e.latlng;
            const bearing = this.calculateBearing(this.startPoint, endPoint);
            
            // Add the LOB to the manualLobs array
            const lat = this.startPoint.lat;
            const lon = this.startPoint.lng;
            this.manualLobs.push({ latitude: lat, longitude: lon, lob: bearing, altitude: 0, loe: 0, obj_id: 0, prob: 1, track_id: 0 });

            // Draw the permanent LOB
            this.addDrawnLob(this.startPoint, bearing);

            // Reset for the next LOB to be drawn, allowing for continuous drawing.
            this.map.off('mousemove', this.onMapMousemove, this);
            if (this.tempPolyline) {
                this.map.removeLayer(this.tempPolyline);
                this.tempPolyline = null;
            }
            if (this.tempMarker) {
                this.tempMarker.closeTooltip(); // Close the tooltip
                this.map.removeLayer(this.tempMarker);
                this.tempMarker = null;
            }
            this.startPoint = null;
        }
    }

    addDrawnLob(start, bearing) {
        const p1 = [start.lat, start.lng];
        const lobLengthMeters = parseFloat(document.getElementById('lobLengthInput').value) * 1000;
        const p2 = this.destVincenty(start.lat, start.lng, bearing, lobLengthMeters); // Use user-defined length

        // Sanity check: Verify the distance between p1 and p2
        // If destVincenty returns null (due to some internal error, though it shouldn't in its original form)
        // or if the calculated distance is wildly different from the input distance.
        if (!p2) {
            alert("Could not calculate LOB end point. Please check input values.");
            return;
        }
        const calculatedDistance = this.getDistance(p1[0], p1[1], p2[0], p2[1]);
        // Allow for a small tolerance, e.g., 1% difference
        if (Math.abs(calculatedDistance - lobLengthMeters) > lobLengthMeters * 0.01 && lobLengthMeters > 0) {
            console.warn(`destVincenty returned an unexpected distance. Expected: ${lobLengthMeters}m, Got: ${calculatedDistance}m. Skipping LOB drawing.`);
            alert("Could not draw LOB accurately. Please try a different length or starting point.");
            return; // Do not draw the LOB
        }

        const polyline = L.polyline([p1, p2], { color: 'green' }).addTo(this.map);
        this.polylines.push(polyline);

        const marker = L.marker(p1).addTo(this.map);
        const tooltipContent = `Lat: ${start.lat.toFixed(5)}<br>Lon: ${start.lng.toFixed(5)}<br>Bearing: ${bearing.toFixed(2)}°`;
        marker.bindTooltip(tooltipContent);
        this.markers.push(marker);
    }

    onMapMousemove(e) {
        if (this.startPoint) {
            const endPoint = e.latlng;
            if (this.tempPolyline) {
                this.map.removeLayer(this.tempPolyline);
            }
            this.tempPolyline = L.polyline([this.startPoint, endPoint], { color: 'red' }).addTo(this.map);

            const bearing = this.calculateBearing(this.startPoint, endPoint);
            const distance = this.startPoint.distanceTo(endPoint);

            const tooltipContent = `Lat: ${endPoint.lat.toFixed(5)}<br>Lon: ${endPoint.lng.toFixed(5)}<br>Bearing: ${bearing.toFixed(2)}°<br>Distance: ${(distance / 1000).toFixed(2)} km`;
            if (this.tempMarker) {
                this.tempMarker.bindTooltip(tooltipContent, { offset: [10, 0] }).openTooltip();
            }
        }
    }

    calculateBearing(start, end) {
        const lat1 = this.toRadians(start.lat);
        const lon1 = this.toRadians(start.lng);
        const lat2 = this.toRadians(end.lat);
        const lon2 = this.toRadians(end.lng);

        const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        const brng = Math.atan2(y, x);

        return (this.toDegrees(brng) + 360) % 360;
    }
}

// Add leaflet-ellipse plugin
(function(L) {
    L.Ellipse = L.Polygon.extend({
        options: {
            weight: 2,
            color: 'blue',
            fillColor: 'lightblue',
            fillOpacity: 0.5
        },

        initialize: function (latlng, radii, tilt, options) {
            this.latlng = L.latLng(latlng);
            this.radii = radii;
            this.tilt = tilt;
            this._shape = [];
            this.options = L.extend({}, this.options, options);
            this.setLatLngs(this.getLatLngs());
        },

        getLatLngs: function () {
            var latlngs = [];
            var res = this.options.resolution || 32;
            var i;

            for (i = 0; i < res; i++) {
                latlngs.push(this._getLatLng(i, res));
            }

            return latlngs;
        },

        _getLatLng: function (i, res) {
            var angle = i * 360 / res;
            var C = Math.cos(angle * Math.PI / 180);
            var S = Math.sin(angle * Math.PI / 180);

            var major = this.radii[0];
            var minor = this.radii[1];

            var major2 = major * major;
            var minor2 = minor * minor;

            var R = Math.sqrt(1 / (C * C / major2 + S * S / minor2));

            var pt = this._getPoint(R, angle);

            return this._transform(pt);
        },

        _getPoint: function (R, angle) {
            var x = R * Math.cos(angle * Math.PI / 180);
            var y = R * Math.sin(angle * Math.PI / 180);

            return L.point(x, y);
        },

        _transform: function (pt) {
            var tilt = this.tilt * Math.PI / 180;
            var C = Math.cos(tilt);
            var S = Math.sin(tilt);

            var x = pt.x * C - pt.y * S;
            var y = pt.x * S + pt.y * C;

            var map = this._map;
            var crs = map.options.crs;
            var latlng = crs.projection.unproject(L.point(x, y).add(map.getPixelOrigin()));

            return latlng.add(this.latlng);
        }
    });

    L.ellipse = function (latlng, radii, tilt, options) {
        return new L.Ellipse(latlng, radii, tilt, options);
    };
})(L);


window.addEventListener('DOMContentLoaded', (event) => {
    new LOBProcessor();
});
