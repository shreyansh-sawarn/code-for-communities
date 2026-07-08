// === MODULE: config.js ===
// --- CONFIGURATION & GLOBAL STATE ---
var CONFIG = {
  defaultLat: 20.5937, // Centered on India
  defaultLng: 78.9629,
  mapZoom: 5, // Zoomed out by default
  storageKey: 'prioritize_complaints_v3',
  apiKeyStorageKey: 'prioritize_api_key',
  primaryModelStorageKey: 'prioritize_primary_model'
};

// Global variables shared across modules
var map;
var markers = [];
var complaints = [];
var recognition = null;
var isRecording = false;
var userLocationMarker = null;
var selectedPhotoBase64 = "";
var selectedPhotoMimeType = "";
var currentSidebarTab = "active"; // 'active' or 'resolved'
var activeConstituency = ""; // Requires login on refresh
var lastResolvedAddress = ""; // Synchronizes text address edits to coordinates

// Clean startup worklist
var BASELINE_COMPLAINTS = [];

// --- SYSTEM CONSOLE UTILITY ---
function logSystem(type, message) {
  const consoleBody = document.getElementById('console-logs');
  if (!consoleBody) return;
  const timestamp = new Date().toLocaleTimeString();
  
  let typeClass = '';
  if (type === "Success") typeClass = 'console-success';
  else if (type === "Warn") typeClass = 'console-warn';
  else if (type === "Error") typeClass = 'console-error';
  
  const logLine = document.createElement('div');
  logLine.className = 'console-line';
  logLine.innerHTML = `[${timestamp}] <span class="${typeClass}">[${type.toUpperCase()}]</span> ${message}`;
  
  consoleBody.appendChild(logLine);
  consoleBody.scrollTop = consoleBody.scrollHeight;
}


// === MODULE: utils.js ===
// --- UTILITY: FORMAT TIME DURATION ---
function formatDuration(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

// --- UTILITY: RESET PHOTO INPUT ---
function resetPhotoInput() {
  const photoInput = document.getElementById('citizen-photo');
  if (photoInput) photoInput.value = '';
  
  selectedPhotoBase64 = "";
  selectedPhotoMimeType = "";
  
  const previewContainer = document.getElementById('photo-preview-container');
  if (previewContainer) previewContainer.style.display = 'none';
  
  const previewImg = document.getElementById('photo-preview');
  if (previewImg) previewImg.src = '';
  
  const clearBtn = document.getElementById('clear-photo');
  if (clearBtn) clearBtn.style.display = 'none';
  
  logSystem("Info", "Photo attachment cleared.");
}

// --- IMAGE COMPRESSION & DOWN-SAMPLING HELPER ---
function compressAndSetPhoto(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 600;
      const MAX_HEIGHT = 600;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Compress to JPEG with 0.75 quality for micro storage footprints
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
      callback(compressedDataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}


// === MODULE: geo.js ===
// --- FREE OPENSTREETMAP NOMINATIM GEOCODING UTILITIES ---
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9' }
    });
    
    if (!res.ok) {
      throw new Error(`HTTP status ${res.status}`);
    }
    
    const data = await res.json();
    if (data && data.display_name) {
      // Clean up the address string to be user friendly (first 3 parts of the address)
      const parts = data.display_name.split(',');
      const simpleAddress = parts.slice(0, 3).join(',').trim();
      document.getElementById('incident-address').value = simpleAddress;
      lastResolvedAddress = simpleAddress; // Sync
      logSystem("Success", `Reverse Geocoded location to: "${simpleAddress}"`);
    } else {
      throw new Error("Empty address response");
    }
  } catch (err) {
    logSystem("Warn", `Reverse geocode rate-limit or error: ${err.message}. Using GPS coordinates directly.`);
    // Fallback: Populate coordinates directly in the box so the field is resolved
    document.getElementById('incident-address').value = `GPS Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

async function geocodeAddress(address) {
  try {
    logSystem("Info", `Geocoding address: "${address}"...`);
    // Append India to restrict search boundaries, but allow any city/landmark in the country
    const query = address.toLowerCase().includes("india") ? address : `${address}, India`;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
    const data = await res.json();
    
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      document.getElementById('lat-input').value = lat;
      document.getElementById('lng-input').value = lng;
      lastResolvedAddress = address; // Sync
      
      if (map) {
        map.setView([lat, lng], 15);
      }
      logSystem("Success", `Located address: (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      updateUserLocationMarker(lat, lng, "Located Address");
      return { lat, lng };
    } else {
      // Try again with just the user address query
      const fallbackRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`);
      const fallbackData = await fallbackRes.json();
      
      if (fallbackData && fallbackData.length > 0) {
        const lat = parseFloat(fallbackData[0].lat);
        const lng = parseFloat(fallbackData[0].lon);
        document.getElementById('lat-input').value = lat;
        document.getElementById('lng-input').value = lng;
        lastResolvedAddress = address; // Sync
        
        if (map) {
          map.setView([lat, lng], 15);
        }
        logSystem("Success", `Located address (global search): (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        updateUserLocationMarker(lat, lng, "Located Address");
        return { lat, lng };
      } else {
        logSystem("Warn", `Could not locate address: "${address}". Using random constituency placement.`);
        return null;
      }
    }
  } catch (err) {
    logSystem("Error", `Geocoding failed: ${err.message}`);
    return null;
  }
}

// --- DYNAMIC CONSTITUENCY RESOLUTION HELPER ---
function resolveConstituency(lat, lng) {
  if (isNaN(lat) || isNaN(lng)) return 'palnadu';
  
  const centers = {
    'palnadu': [16.2366, 80.0531],
    'delhi': [28.6139, 77.2090],
    'howrah': [22.5850, 88.3475],
    'guntur': [16.3067, 80.4365],
    'hyderabad': [17.3850, 78.4867]
  };

  let closestConst = 'palnadu';
  let minDist = Infinity;

  for (const [key, coords] of Object.entries(centers)) {
    const dist = Math.sqrt(Math.pow(lat - coords[0], 2) + Math.pow(lng - coords[1], 2));
    if (dist < minDist) {
      minDist = dist;
      closestConst = key;
    }
  }
  return closestConst;
}


// === MODULE: map.js ===
// --- LEAFLET MAP CONTROLLER MODULE ---
function initMap() {
  const defaultLat = CONFIG.defaultLat; // Centered on India
  const defaultLng = CONFIG.defaultLng;
  const defaultZoom = CONFIG.mapZoom;

  // Initialize leaflet map
  map = L.map('map').setView([defaultLat, defaultLng], defaultZoom);
  
  // Load beautiful dark mode map tiles from CartoDB
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20
  }).addTo(map);

  // Map click handler to pin location coordinates & reverse geocode
  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    document.getElementById('lat-input').value = lat;
    document.getElementById('lng-input').value = lng;
    logSystem("Info", `Coordinates pinned on map: (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    reverseGeocode(lat, lng);
    updateUserLocationMarker(lat, lng, "Selected Location");
  });

  // Auto-locate user on page load
  if (navigator.geolocation) {
    logSystem("Info", "Auto-locating user position on load...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        document.getElementById('lat-input').value = lat;
        document.getElementById('lng-input').value = lng;
        map.setView([lat, lng], 14);
        logSystem("Success", `Auto-located to: (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        reverseGeocode(lat, lng);
        updateUserLocationMarker(lat, lng, "Your Location");
      },
      (error) => {
        logSystem("Info", `Auto-locate skipped: ${error.message}. Defaulting view to India.`);
      }
    );
  }
}

// --- DYNAMIC USER SELECTION POINTER ---
function updateUserLocationMarker(lat, lng, label = "Selected Location") {
  if (userLocationMarker) {
    map.removeLayer(userLocationMarker);
  }

  // Beautiful blue pulsing location marker representing user current selection
  const markerHtml = `
    <div style="
      background-color: var(--accent-blue);
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 0 15px var(--accent-blue);
      animation: pulse 1.5s infinite;
    "></div>
  `;

  const customIcon = L.divIcon({
    html: markerHtml,
    className: 'user-position-marker',
    iconSize: [14, 14]
  });

  userLocationMarker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
  userLocationMarker.bindPopup(`
    <strong>${label}</strong><br/>
    This location will be submitted with your complaint.
  `).openPopup();
}


// === MODULE: api.js ===
// --- DYNAMIC AI ENGINE CALL PIPELINE WITH MODEL FALLBACKS ---
async function callGeminiWithFallback(apiKey, text, imageBase64, imageMimeType) {
  const primaryModel = localStorage.getItem(CONFIG.primaryModelStorageKey) || 'gemini-3.1-flash';
  const models = [
    primaryModel,
    'gemini-2.5-flash',
    'gemini-1.5-flash'
  ];

  // Filter models array to ensure uniqueness
  const modelPipeline = [...new Set(models)];
  
  const systemPrompt = `You are a public grievance analysis engine for a Member of Parliament.
Analyze the following citizen input (which may be in English, Hindi, or Telugu).
First, determine if the input is a valid public grievance. 
A valid grievance includes ANY report of local infrastructure damage, public service failures, water supply issues, hygiene hazards, school safety concerns, farm distress, as well as general public safety hazards, road blocks, emergencies, accidents, or public protests requiring local government intervention.
Set "is_grievance" to false ONLY if the input is simple conversational chatter (like "hello", "how are you"), jokes, testing gibberish, or purely personal desires with no community impact (like "I want to eat pizza" or "I want to dance in the rain").

Your JSON structure MUST be precisely:
{
  "is_grievance": boolean,
  "category": "roads" | "water" | "health" | "education" | "agriculture" | "none",
  "urgency": integer between 1 and 10,
  "summary": "Brief 1-sentence summary of the input in English",
  "recommended_action": "Actionable recommendation for the MP (or explain why it is not a public grievance if is_grievance is false)"
}

Do not wrap the JSON output in markdown tags like \`\`\`json. Return only raw JSON.`;

  for (let i = 0; i < modelPipeline.length; i++) {
    const activeModel = modelPipeline[i];
    logSystem("Info", `Connecting to AI Engine via model: ${activeModel}...`);
    document.getElementById('active-model-badge').innerText = `Active Model: ${activeModel}`;
    
    try {
      const parts = [
        { text: `${systemPrompt}\n\nComplaint description: "${text}"` }
      ];

      // If the citizen uploaded an image, attach it to the parts array for multimodal analysis
      if (imageBase64 && imageMimeType) {
        parts.push({
          inlineData: {
            mimeType: imageMimeType,
            data: imageBase64
          }
        });
        logSystem("Info", `[AI] Attached photo proof to payload (${imageMimeType}).`);
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: parts
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
        throw new Error("Empty or invalid candidate response from Gemini API");
      }

      const responseText = data.candidates[0].content.parts[0].text.trim();
      
      // Sanitize response to isolate JSON if the model outputs markdown anyway
      const jsonStart = responseText.indexOf('{');
      const jsonEnd = responseText.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("Invalid output formatting: output did not contain a JSON object");
      }
      
      const cleanJsonString = responseText.substring(jsonStart, jsonEnd + 1);
      const parsedData = JSON.parse(cleanJsonString);

      // Validate required keys
      if (!parsedData.category || !parsedData.urgency || !parsedData.summary) {
        throw new Error("Missing required JSON parameters");
      }

      logSystem("Success", `AI model ${activeModel} parsed response successfully.`);
      return parsedData;
      
    } catch (err) {
      logSystem("Warn", `[FALLBACK] Model ${activeModel} failed: ${err.message || err}`);
      if (i === modelPipeline.length - 1) {
        throw new Error("All fallback models in the pipeline failed. Verify your API key and network connection.");
      }
    }
  }
}


// === MODULE: voice.js ===
// --- VOICE RECOGNITION (WEB SPEECH API) MODULE ---
let initialText = "";

function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    logSystem("Error", "Speech recognition is not supported in this browser. Please use Google Chrome.");
    document.getElementById('record-status').innerText = "Voice input unsupported in this browser.";
    document.getElementById('record-btn').disabled = true;
    return;
  }
  
  recognition = new SpeechRecognition();
  recognition.continuous = true; // Stay active even when user pauses speaking
  recognition.interimResults = true; // Set to true for live visual feedback as they speak
  
  recognition.onstart = () => {
    isRecording = true;
    initialText = document.getElementById('complaint-text').value;
    document.getElementById('voice-card').classList.add('recording');
    document.getElementById('record-status').innerText = "Recording... Click mic to stop.";
    logSystem("Info", "Voice Recognition started. Continuous listening active...");
  };
  
  recognition.onresult = (event) => {
    let sessionTranscript = "";
    for (let i = 0; i < event.results.length; ++i) {
      sessionTranscript += event.results[i][0].transcript;
    }
    const textArea = document.getElementById('complaint-text');
    // Overwrite dynamically using the initial value + consolidated transcript
    textArea.value = (initialText + " " + sessionTranscript).trim();
  };
  
  recognition.onerror = (event) => {
    logSystem("Error", `Voice Recognition Error: ${event.error}`);
    stopRecordingUI();
  };
  
  recognition.onend = () => {
    stopRecordingUI();
    const finalTranscript = document.getElementById('complaint-text').value;
    logSystem("Success", `Voice Ingested: "${finalTranscript.substring(initialText.length).trim()}"`);
  };
}

function stopRecordingUI() {
  isRecording = false;
  const voiceCard = document.getElementById('voice-card');
  if (voiceCard) voiceCard.classList.remove('recording');
  
  const recordStatus = document.getElementById('record-status');
  if (recordStatus) recordStatus.innerText = "Click to speak in your native language";
  
  logSystem("Info", "Voice Recognition ended.");
}


// === MODULE: auth.js ===
// --- MP SECURITY & VIEW SYSTEM MODULE ---
function switchRoleView(role) {
  const main = document.querySelector('main');
  const mpPane = document.getElementById('mp-pane');
  const citizenBtn = document.getElementById('btn-citizen-role');
  const mpBtn = document.getElementById('btn-mp-role');

  if (role === 'citizen') {
    main.classList.remove('mp-mode');
    mpPane.classList.add('citizen-mode');
    citizenBtn.classList.add('active');
    mpBtn.classList.remove('active');
    logSystem("Info", "Switched view to Citizen Portal.");
  } else {
    main.classList.add('mp-mode');
    mpPane.classList.remove('citizen-mode');
    citizenBtn.classList.remove('active');
    mpBtn.classList.add('active');
    logSystem("Info", "Switched view to MP Dashboard.");

    // Toggle secure panel visibility based on active session
    if (activeConstituency) {
      mpPane.classList.remove('logged-out');
    } else {
      mpPane.classList.add('logged-out');
    }
  }

  // Recalculate leaflet map boundary in both cases
  setTimeout(() => {
    if (map) {
      map.invalidateSize(true);
    }
  }, 150);
}

function handleMPLogin() {
  const idInput = document.getElementById('login-id').value.trim();
  const pwInput = document.getElementById('login-pw').value.trim();
  const mpPane = document.getElementById('mp-pane');

  const credentials = {
    'MP_PALNADU': { constituency: 'palnadu', center: [16.2366, 80.0531], name: "Palnadu / Narasaraopet" },
    'MP_DELHI': { constituency: 'delhi', center: [28.6139, 77.2090], name: "New Delhi" },
    'MP_HOWRAH': { constituency: 'howrah', center: [22.5850, 88.3475], name: "Howrah" },
    'MP_GUNTUR': { constituency: 'guntur', center: [16.3067, 80.4365], name: "Guntur" },
    'MP_HYDERABAD': { constituency: 'hyderabad', center: [17.3850, 78.4867], name: "Hyderabad" }
  };

  if (credentials[idInput] && pwInput === 'admin') {
    const cred = credentials[idInput];
    activeConstituency = cred.constituency;
    sessionStorage.setItem('prioritize_active_constituency', activeConstituency);
    
    // Reveal dashboard content by removing logged-out class
    mpPane.classList.remove('logged-out');
    
    // Fly map to MP's specific constituency coordinates
    if (map) {
      map.setView(cred.center, 13);
      logSystem("Success", `[AUTH] Loaded map center for ${cred.name} (${cred.center[0]}, ${cred.center[1]})`);
    }

    logSystem("Success", `[AUTH] Authenticated successfully as MP of ${cred.name}.`);
    renderDashboard();

    // Recalculate map boundary after CSS layout transitions finish
    setTimeout(() => {
      if (map) {
        map.invalidateSize(true);
      }
    }, 200);
  } else {
    alert("Invalid MP ID or Password. Try typing MP_PALNADU, MP_DELHI, MP_HOWRAH, MP_GUNTUR, or MP_HYDERABAD (password: admin)");
    logSystem("Error", "[AUTH] Failed authentication attempt.");
  }
}

function handleMPLogout() {
  activeConstituency = "";
  sessionStorage.removeItem('prioritize_active_constituency');
  
  const mpPane = document.getElementById('mp-pane');
  mpPane.classList.add('logged-out');
  
  logSystem("Success", "[AUTH] MP logged out of session successfully.");
  
  // Switch back to Citizen view role for a clean reset
  switchRoleView('citizen');
}


// === CONTROLLER ===
// --- INITIALIZATION ---
function startup() {
  initLocalStorage();
  initMap();
  initVoiceRecognition();
  bindEvents();
  
  // Set initial login class based on session storage
  const mpPane = document.getElementById('mp-pane');
  if (mpPane) {
    if (activeConstituency) {
      mpPane.classList.remove('logged-out');
    } else {
      mpPane.classList.add('logged-out');
    }
  }
  
  renderDashboard();
  logSystem("Success", "Dashboard loaded. Live Leaflet map plotted.");
}

// Resilient DOM ready check to prevent race conditions
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startup);
} else {
  startup();
}

function initLocalStorage() {
  if (!localStorage.getItem(CONFIG.storageKey)) {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(BASELINE_COMPLAINTS));
    complaints = [...BASELINE_COMPLAINTS];
  } else {
    complaints = JSON.parse(localStorage.getItem(CONFIG.storageKey));
  }
  
  // Set default keys if missing
  if (!localStorage.getItem(CONFIG.primaryModelStorageKey)) {
    localStorage.setItem(CONFIG.primaryModelStorageKey, 'gemini-3.1-flash');
  }
  
  // Update Settings inputs
  document.getElementById('api-key').value = localStorage.getItem(CONFIG.apiKeyStorageKey) || '';
  document.getElementById('primary-model').value = localStorage.getItem(CONFIG.primaryModelStorageKey) || 'gemini-3.1-flash';
}

// --- EVENTS ---
function bindEvents() {
  // Modal opening/closing
  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('open-settings').addEventListener('click', () => {
    settingsModal.classList.add('active');
  });
  
  document.getElementById('close-settings').addEventListener('click', () => {
    settingsModal.classList.remove('active');
  });
  
  // Save settings
  document.getElementById('save-settings').addEventListener('click', () => {
    const apiKey = document.getElementById('api-key').value.trim();
    const primaryModel = document.getElementById('primary-model').value;
    
    localStorage.setItem(CONFIG.apiKeyStorageKey, apiKey);
    localStorage.setItem(CONFIG.primaryModelStorageKey, primaryModel);
    
    settingsModal.classList.remove('active');
    logSystem("Success", `Settings saved. Model: ${primaryModel}`);
  });
  
  // Voice Recording trigger
  document.getElementById('record-btn').addEventListener('click', () => {
    if (!recognition) return;
    
    if (isRecording) {
      recognition.stop();
    } else {
      const selectedLang = document.getElementById('voice-lang').value;
      recognition.lang = selectedLang;
      recognition.start();
    }
  });

  // Locate Address manually
  document.getElementById('locate-btn').addEventListener('click', () => {
    const address = document.getElementById('incident-address').value.trim();
    if (!address) {
      alert("Please enter an address or landmark to locate first.");
      return;
    }
    geocodeAddress(address);
  });

  // GPS geolocation button
  document.getElementById('gps-btn').addEventListener('click', () => {
    if (navigator.geolocation) {
      logSystem("Info", "Requesting GPS coordinates from browser...");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          document.getElementById('lat-input').value = lat;
          document.getElementById('lng-input').value = lng;
          map.setView([lat, lng], 15);
          logSystem("Success", `GPS retrieved coordinates: (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
          reverseGeocode(lat, lng);
          updateUserLocationMarker(lat, lng, "Your Current GPS Location");
        },
        (error) => {
          logSystem("Warn", `GPS request failed: ${error.message}`);
          alert(`GPS failed: ${error.message}. Try clicking directly on the map.`);
        }
      );
    } else {
      alert("Browser Geolocation is not supported by your browser.");
    }
  });

  // Real photo upload change listener
  document.getElementById('citizen-photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const previewContainer = document.getElementById('photo-preview-container');
    const previewImg = document.getElementById('photo-preview');
    const clearBtn = document.getElementById('clear-photo');

    if (file) {
      if (!file.type.startsWith('image/')) {
        alert("Please select an image file.");
        e.target.value = '';
        return;
      }

      // Optimize image using canvas compression to prevent localStorage quota overflows
      compressAndSetPhoto(file, (dataUrl) => {
        selectedPhotoBase64 = dataUrl.split(',')[1];
        selectedPhotoMimeType = 'image/jpeg';
        
        previewImg.src = dataUrl;
        previewContainer.style.display = 'block';
        clearBtn.style.display = 'flex';
        logSystem("Success", `Photo loaded and optimized: "${file.name}"`);
      });
    } else {
      resetPhotoInput();
    }
  });

  document.getElementById('clear-photo').addEventListener('click', resetPhotoInput);

  // Photo viewer modal close
  document.getElementById('close-photo-viewer').addEventListener('click', () => {
    document.getElementById('photo-viewer-modal').classList.remove('active');
  });

  // Submission Pipeline
  document.getElementById('submit-complaint').addEventListener('click', handleSubmit);

  // Role Switcher toggling
  document.getElementById('btn-citizen-role').addEventListener('click', () => {
    switchRoleView('citizen');
  });

  document.getElementById('btn-mp-role').addEventListener('click', () => {
    switchRoleView('mp');
  });

  // Sidebar Queue tabs
  document.getElementById('tab-active').addEventListener('click', () => {
    currentSidebarTab = 'active';
    document.getElementById('tab-active').classList.add('active');
    document.getElementById('tab-resolved').classList.remove('active');
    document.getElementById('sidebar-tab-badge').innerText = "Active Queue";
    document.getElementById('sidebar-tab-badge').className = "badge badge-live";
    renderDashboard();
  });

  document.getElementById('tab-resolved').addEventListener('click', () => {
    currentSidebarTab = 'resolved';
    document.getElementById('tab-resolved').classList.add('active');
    document.getElementById('tab-active').classList.remove('active');
    document.getElementById('sidebar-tab-badge').innerText = "Resolved History";
    document.getElementById('sidebar-tab-badge').className = "badge";
    renderDashboard();
  });

  // MP Login Submit listener
  document.getElementById('btn-login-submit').addEventListener('click', handleMPLogin);

  // MP Logout listener
  document.getElementById('btn-admin-logout').addEventListener('click', handleMPLogout);
}

// --- PIPELINE & DYNAMIC PROCESSING ---
async function handleSubmit() {
  const desc = document.getElementById('complaint-text').value.trim();
  const name = document.getElementById('citizen-name').value.trim() || "Anonymous";
  const contact = document.getElementById('citizen-contact').value.trim() || "Unspecified";
  const address = document.getElementById('incident-address').value.trim();
  let lat = parseFloat(document.getElementById('lat-input').value);
  let lng = parseFloat(document.getElementById('lng-input').value);

  if (!desc) {
    alert("Please provide a detailed description of the complaint.");
    return;
  }

  // Get API key
  const apiKey = localStorage.getItem(CONFIG.apiKeyStorageKey);
  if (!apiKey) {
    alert("Please click the settings gear at the top right and enter your Gemini API Key first.");
    document.getElementById('settings-modal').classList.add('active');
    return;
  }

  // Disable submit button and show loading state
  const submitBtn = document.getElementById('submit-complaint');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing with AI...';

  logSystem("Info", "Starting AI processing pipeline...");

  try {
    // Force geocoding if the user typed/changed the address without locating it on map
    if (address && address !== lastResolvedAddress) {
      logSystem("Info", "Address input changed. Force-geocoding to coordinate bounds...");
      const coords = await geocodeAddress(address);
      if (coords) {
        lat = coords.lat;
        lng = coords.lng;
      }
    }

    // If coordinates are still missing, resolve the address/landmark using Geocoding
    if (isNaN(lat) || isNaN(lng)) {
      if (address) {
        const coords = await geocodeAddress(address);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }
    }

    // Fallback: If geocoding fails or no address, look for text clues in address/landmark
    if (isNaN(lat) || isNaN(lng)) {
      const cleanAddr = address.toLowerCase();
      let center = [16.2366, 80.0531]; // Default Palnadu
      let matched = 'palnadu';
      
      if (cleanAddr.includes("delhi")) {
        center = [28.6139, 77.2090];
        matched = 'delhi';
      } else if (cleanAddr.includes("howrah") || cleanAddr.includes("kolkata") || cleanAddr.includes("calcutta")) {
        center = [22.5850, 88.3475];
        matched = 'howrah';
      } else if (cleanAddr.includes("guntur")) {
        center = [16.3067, 80.4365];
        matched = 'guntur';
      } else if (cleanAddr.includes("hyderabad")) {
        center = [17.3850, 78.4867];
        matched = 'hyderabad';
      }
      
      lat = center[0] + (Math.random() - 0.5) * 0.01;
      lng = center[1] + (Math.random() - 0.5) * 0.01;
      logSystem("Warn", `Geocoding failed. Inferred constituency "${matched}" from address text and placed near center: (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    }

    const aiResponse = await callGeminiWithFallback(apiKey, desc, selectedPhotoBase64, selectedPhotoMimeType);
    
    // Programmatic override safeguard for critical community / safety keywords
    const cleanDesc = desc.toLowerCase();
    const safetyKeywords = ["protest", "barricade", "blockade", "accident", "strike", "jam", "clash", "fight", "fire"];
    const containsKeyword = safetyKeywords.some(kw => cleanDesc.includes(kw));
    
    if (containsKeyword) {
      aiResponse.is_grievance = true;
      if (aiResponse.category.toLowerCase() === "none" || !aiResponse.category) {
        aiResponse.category = "roads"; // Default blockages/accidents to roads/infrastructure
      }
      if (parseInt(aiResponse.urgency) < 5) {
        aiResponse.urgency = 8; // Guarantee high urgency for protests/emergencies
      }
    }

    // Spam/Irrelevance Filter check
    if (aiResponse.is_grievance === false || aiResponse.category.toLowerCase() === "none" || aiResponse.urgency <= 1) {
      logSystem("Warn", `[SPAM FILTERED] Non-grievance entry rejected: "${aiResponse.summary}"`);
      alert(`Submission Received.\n\nAI Assessment: Classified as non-grievance (${aiResponse.summary}).\n\nThis entry has been filtered out to keep the MP's priority dashboard focused on critical infrastructure and services.`);
      
      // Clear inputs & return without saving
      document.getElementById('complaint-text').value = '';
      document.getElementById('citizen-name').value = '';
      document.getElementById('citizen-contact').value = '';
      document.getElementById('incident-address').value = '';
      document.getElementById('lat-input').value = '';
      document.getElementById('lng-input').value = '';
      resetPhotoInput();
      return;
    }
    
    // Save image Base64 data directly in storage if it exists, otherwise "none"
    const photoDataUrl = selectedPhotoBase64 ? `data:${selectedPhotoMimeType};base64,${selectedPhotoBase64}` : "none";

    // Create new complaint item
    const newComplaint = {
      id: Date.now(),
      createdTime: Date.now(), // Unix timestamp for calculating resolution speed
      name,
      contact,
      desc,
      category: aiResponse.category.toLowerCase(),
      urgency: parseInt(aiResponse.urgency) || 5,
      lat,
      lng,
      constituency: resolveConstituency(lat, lng), // Segment geographically
      summary: aiResponse.summary,
      action: aiResponse.recommended_action,
      photo: photoDataUrl,
      timestamp: new Date().toLocaleDateString()
    };

    // Save and re-render dashboard
    complaints.unshift(newComplaint);
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(complaints));
    
    // Remove the current proposed marker since it is now submitted
    if (userLocationMarker) {
      map.removeLayer(userLocationMarker);
      userLocationMarker = null;
    }

    // Render dashboard and auto-zoom to the new incident
    renderDashboard();
    map.setView([lat, lng], 15);

    // Automated escalation alerts for critical complaints (urgency >= 8)
    if (newComplaint.urgency >= 8) {
      const depts = {
        'roads': { name: 'Public Works & Highways Department', email: 'highways@infra.gov.in', contact: '+91 98401 10203' },
        'water': { name: 'Water Supply & Sanitation Board', email: 'waterboard@municipal.gov.in', contact: '+91 98402 10203' },
        'health': { name: 'District Medical & Health Department', email: 'dmho@health.gov.in', contact: '+91 98403 10203' },
        'education': { name: 'District Primary Education Board', email: 'education@schools.gov.in', contact: '+91 98404 10203' },
        'agriculture': { name: 'Agricultural Extension Directorate', email: 'agri@farming.gov.in', contact: '+91 98405 10203' }
      };
      
      const targetDept = depts[newComplaint.category] || { name: "District Municipal Commissioner's Office", email: 'commissioner@municipal.gov.in', contact: '+91 98400 10203' };
      
      const mpDetails = {
        'palnadu': { name: 'MP office of Palnadu / Narasaraopet', contact: '+91 90131 81822', email: 'mp.palnadu@sansad.nic.in' },
        'delhi': { name: 'MP office of New Delhi', contact: '+91 98681 81020', email: 'mp.delhi@sansad.nic.in' },
        'howrah': { name: 'MP office of Howrah', contact: '+91 94330 33020', email: 'mp.howrah@sansad.nic.in' },
        'guntur': { name: 'MP office of Guntur', contact: '+91 98480 48020', email: 'mp.guntur@sansad.nic.in' },
        'hyderabad': { name: 'MP office of Hyderabad', contact: '+91 98490 49020', email: 'mp.hyderabad@sansad.nic.in' }
      };
      
      const mpInfo = mpDetails[newComplaint.constituency] || mpDetails['palnadu'];
      const constName = newComplaint.constituency === 'delhi' ? 'New Delhi' : (newComplaint.constituency === 'howrah' ? 'Howrah' : 'Palnadu / Narasaraopet');

      logSystem("Warn", `[AUTOMATED ESCALATION] Sent Critical Alert to ${targetDept.name} & ${mpInfo.name}.`);
      
      alert(`🚨 [CRITICAL PUBLIC EMERGENCY ESCALATION]
AI Urgency Rating: ${newComplaint.urgency}/10

Because this issue is classified as critical, automated notification alerts have been dispatched:

1. 🏢 TO THE RELEVANT AUTHORITY:
   - Department: ${targetDept.name}
   - 📩 Email Sent: ${targetDept.email}
   - 💬 SMS Dispatch: Sent to Duty Officer (${targetDept.contact})

2. 🏛️ TO THE CONSTITUENCY MEMBER OF PARLIAMENT (MP):
   - Office: ${mpInfo.name}
   - 📩 Email Sent: ${mpInfo.email}
   - 💬 SMS Dispatch: Sent to MP hot-line (${mpInfo.contact})

Subject: [URGENT ESCALATION] Critical ${newComplaint.category.toUpperCase()} Issue in ${constName}
Body: "${newComplaint.summary}"

Escalation actions have been simulated successfully!`);
    }
    
    // Clear form inputs & photo preview
    document.getElementById('complaint-text').value = '';
    document.getElementById('citizen-name').value = '';
    document.getElementById('citizen-contact').value = '';
    document.getElementById('incident-address').value = '';
    document.getElementById('lat-input').value = '';
    document.getElementById('lng-input').value = '';
    resetPhotoInput();

    logSystem("Success", `AI Pipeline Completed: Category=${newComplaint.category}, Urgency=${newComplaint.urgency}`);
  } catch (error) {
    logSystem("Error", `Pipeline Failed: ${error.message}`);
    alert(`Failed to analyze complaint. Error: ${error.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit to AI Pipeline';
  }
}

// --- RENDER DASHBOARD (MAP, STATS & PRIORITIZED LIST) ---
function renderDashboard() {
  // 1. Reset Leaflet markers
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];

  // Read resolved list from cache
  const resolvedList = JSON.parse(localStorage.getItem('prioritize_resolved_list') || '[]');

  // Filter complaints and resolvedList to only show those belonging to the active MP's constituency
  // If no MP is authenticated, show an empty array
  const activeComplaints = complaints.filter(comp => {
    const compConst = comp.constituency || resolveConstituency(comp.lat, comp.lng);
    return compConst === activeConstituency;
  });

  const activeResolved = resolvedList.filter(comp => {
    const compConst = comp.constituency || resolveConstituency(comp.lat, comp.lng);
    return compConst === activeConstituency;
  });

  // 2. Recalculate metrics
  const totalActive = activeComplaints.length;
  const critical = activeComplaints.filter(c => c.urgency >= 8).length;
  const resolved = activeResolved.length;
  
  document.getElementById('stat-total').innerText = totalActive;
  document.getElementById('stat-critical').innerText = critical;
  document.getElementById('stat-resolved').innerText = resolved;

  // Update tab counts
  document.getElementById('count-active').innerText = totalActive;
  document.getElementById('count-resolved').innerText = resolved;

  const listContainer = document.getElementById('priority-list-container');
  listContainer.innerHTML = '';

  // 3. Render based on active tab selection
  if (currentSidebarTab === 'active') {
    // Sort complaints by Urgency (Highest first) for the dynamic list
    activeComplaints.sort((a, b) => b.urgency - a.urgency);

    activeComplaints.forEach((comp, index) => {
      // Add Marker to map with urgency color codes
      let markerColor = '#10b981'; // Green
      if (comp.urgency >= 8) markerColor = '#f43f5e'; // Red
      else if (comp.urgency >= 5) markerColor = '#f59e0b'; // Amber

      // Custom circular colored markers representing priorities on Leaflet
      const markerHtml = `
        <div style="
          background-color: ${markerColor};
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 0 10px rgba(0,0,0,0.5);
        "></div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-map-marker',
        iconSize: [14, 14]
      });

      const marker = L.marker([comp.lat, comp.lng], { icon: customIcon }).addTo(map);
      
      // Bind Popup containing details and AI suggestions
      let popupPhotoHtml = '';
      if (comp.photo && comp.photo !== "none" && comp.photo.startsWith("data:")) {
        popupPhotoHtml = `
          <div style="margin-top: 0.5rem; border-radius: 4px; overflow: hidden; max-height: 100px; cursor: zoom-in;" onclick="window.openPhotoViewer('${comp.photo}')">
            <img src="${comp.photo}" style="width: 100%; height: 100px; object-fit: cover;" />
          </div>
        `;
      }

      const popupContent = `
        <div style="font-family: inherit; max-width: 250px;">
          <h4 style="color: ${markerColor}; display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
            <span>Category: ${comp.category.toUpperCase()}</span>
            <span>Rank #${index + 1}</span>
          </h4>
          <p style="font-weight: 600; margin-top: 0.25rem;">${comp.summary}</p>
          <p style="margin-top: 0.25rem; font-style:italic;">"${comp.desc.substring(0, 80)}..."</p>
          ${popupPhotoHtml}
          <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #334155;">
            <strong>AI Recommended Action:</strong>
            <p style="color: var(--accent-indigo); font-size: 0.75rem; margin-top: 0.15rem; margin-bottom: 0.5rem;">${comp.action}</p>
          </div>
          <button class="btn-resolve" onclick="resolveGrievance(${comp.id})">
            <i class="fa-solid fa-check-double"></i> Mark as Resolved
          </button>
          <p style="font-size: 0.7rem; color: #64748b; margin-top: 0.6rem;">Submitter: ${comp.name} | ${comp.timestamp}</p>
        </div>
      `;
      marker.bindPopup(popupContent);
      markers.push(marker);

      // Create Sidebar priority card
      const card = document.createElement('div');
      card.className = 'priority-card';
      
      let cardPhotoHtml = '';
      if (comp.photo && comp.photo !== "none" && comp.photo.startsWith("data:")) {
        cardPhotoHtml = `
          <div style="margin-top: 0.4rem; border-radius: 4px; overflow: hidden; max-height: 80px; cursor: zoom-in;" onclick="event.stopPropagation(); window.openPhotoViewer('${comp.photo}')">
            <img src="${comp.photo}" style="width: 100%; height: 80px; object-fit: cover;" />
          </div>
        `;
      }

      card.innerHTML = `
        <div class="card-header">
          <span class="card-cat cat-${comp.category}">${comp.category}</span>
          <span class="card-urgency" style="color: ${markerColor};">
            <i class="fa-solid fa-triangle-exclamation"></i> Urgency ${comp.urgency}/10
          </span>
        </div>
        <h4 class="card-title">#${index + 1} - ${comp.summary}</h4>
        <p class="card-desc">"${comp.desc}"</p>
        ${cardPhotoHtml}
        <div class="card-footer">
          <span>By: ${comp.name}</span>
          <span>${comp.timestamp}</span>
        </div>
      `;

      // Zoom on map when clicking sidebar card
      card.addEventListener('click', () => {
        map.setView([comp.lat, comp.lng], 16);
        marker.openPopup();
      });

      listContainer.appendChild(card);
    });
  } else {
    // Render Resolved History list
    if (activeResolved.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); margin-top: 2rem; font-size: 0.8rem; font-style: italic;">
          No resolved cases in history yet. Active issues will show up here once marked resolved.
        </div>
      `;
      return;
    }

    activeResolved.forEach((comp, index) => {
      // Create Sidebar priority card for resolved item
      const card = document.createElement('div');
      card.className = 'priority-card';
      card.style.borderLeft = '4px solid var(--accent-emerald)';
      
      let cardPhotoHtml = '';
      if (comp.photo && comp.photo !== "none" && comp.photo.startsWith("data:")) {
        cardPhotoHtml = `
          <div style="margin-top: 0.4rem; border-radius: 4px; overflow: hidden; max-height: 80px; opacity: 0.7; cursor: zoom-in;" onclick="event.stopPropagation(); window.openPhotoViewer('${comp.photo}')">
            <img src="${comp.photo}" style="width: 100%; height: 80px; object-fit: cover;" />
          </div>
        `;
      }

      card.innerHTML = `
        <div class="card-header">
          <span class="card-cat cat-${comp.category}" style="opacity: 0.85;">${comp.category}</span>
          <span class="card-urgency" style="color: var(--accent-emerald); font-weight: 700;">
            <i class="fa-solid fa-circle-check"></i> RESOLVED
          </span>
        </div>
        <h4 class="card-title" style="text-decoration: line-through; opacity: 0.7; font-size: 0.85rem;">${comp.summary}</h4>
        <p class="card-desc" style="opacity: 0.65; font-size: 0.75rem;">"${comp.desc}"</p>
        
        <div style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 4px; font-size: 0.72rem;">
          <div style="color: var(--accent-emerald); font-weight: 700; display: flex; align-items: center; gap: 0.25rem;">
            <i class="fa-solid fa-screwdriver-wrench"></i> Resolution Action Taken:
          </div>
          <p style="color: var(--text-primary); margin-top: 0.15rem; font-style: italic;">${comp.resolvedAction}</p>
          <div style="color: var(--accent-blue); font-weight: 600; margin-top: 0.35rem; display: flex; align-items: center; gap: 0.25rem;">
            <i class="fa-solid fa-stopwatch"></i> Resolution Duration: <span style="color: var(--text-primary);">${comp.resolutionDurationStr}</span>
          </div>
        </div>

        ${cardPhotoHtml}
        <div class="card-footer">
          <span>By: ${comp.name}</span>
          <span>Resolved: ${comp.timestamp}</span>
        </div>
      `;

      listContainer.appendChild(card);
    });
  }
}

// --- GLOBAL MP GRIEVANCE RESOLUTION CONTROLLER ---
window.resolveGrievance = function(id) {
  const index = complaints.findIndex(c => c.id === id);
  if (index !== -1) {
    const comp = complaints[index];
    
    // Prompt for action taken
    const action = prompt(`[MP RESOLUTION ACTION]\n\nIssue: "${comp.summary}"\n\nEnter the resolution action taken by your office:`, "Dispatched repair crews to resolve this constituency complaint immediately.");
    
    if (action === null) {
      logSystem("Info", "Resolution action cancelled.");
      return; // Cancelled
    }

    const actionText = action.trim() || "Resolved by MP administrative action.";
    const createdTime = comp.createdTime || (Date.now() - 3600000); // Fallback to 1 hour for mock/legacy templates
    const durationMs = Date.now() - createdTime;
    const durationStr = formatDuration(durationMs);

    logSystem("Success", `[RESOLVED] Grievance #${comp.id} ("${comp.summary}") marked as resolved.`);
    
    // Assemble resolved object
    const resolvedItem = {
      ...comp,
      resolvedAction: actionText,
      resolvedTime: Date.now(),
      resolutionDurationStr: durationStr,
      timestamp: new Date().toLocaleDateString()
    };

    // Save to resolved list in local cache
    let resolvedList = JSON.parse(localStorage.getItem('prioritize_resolved_list') || '[]');
    resolvedList.unshift(resolvedItem);
    localStorage.setItem('prioritize_resolved_list', JSON.stringify(resolvedList));
    
    // Increment resolved count in local cache
    localStorage.setItem('prioritize_resolved_count', resolvedList.length);
    
    // Remove the resolved complaint from the active list
    complaints.splice(index, 1);
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(complaints));
    
    // Simulate SMS Notification to Submitter
    if (comp.contact && comp.contact !== "Unspecified" && comp.contact !== "98765 XXXXX") {
      const smsMsg = `Dear ${comp.name}, your grievance regarding "${comp.summary}" has been marked as RESOLVED by the MP Office.\n\nAction Taken: ${actionText}\nResolution Time: ${durationStr}.\n\nThank you for prioritizing development!`;
      logSystem("Success", `[SMS SIMULATED] Sent SMS to ${comp.contact}: "${smsMsg}"`);
      alert(`[SMS NOTIFICATION SIMULATED]\nSent to Submitter (${comp.contact}):\n\n"${smsMsg}"`);
    } else {
      logSystem("Info", `No valid citizen contact number provided for SMS alert on Grievance #${comp.id}.`);
    }

    // Refresh map and metrics
    renderDashboard();
  }
};
