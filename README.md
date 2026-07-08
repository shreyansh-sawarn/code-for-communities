# 🏛️ Prioritize - AI-Powered Constituency Development Platform

**Prioritize** is a serverless, single-page, multi-lingual constituency priorities dashboard designed for **Track 1: People's Priorities**. It bridges the gap between citizens and their local Members of Parliament (MPs). It allows citizens to voice their grievances via speech or text in native languages and provides MPs with an AI-prioritized, map-based emergency dispatch and decision dashboard.

Designed with **zero backend server costs**, the platform runs entirely client-side, making it highly secure, deployable in seconds, and completely free to operate.

---

## 🚀 Live Demo & Deployment Guide

Since this is a client-side static web application (HTML/CSS/JS), it can be deployed to the cloud for free in less than 60 seconds:

### 1. Deploy via GitHub Pages (Recommended - 100% Free)
1. Initialize a git repository and push the code to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Prioritize platform"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```
2. Go to your repository on GitHub.
3. Click on **Settings** ➔ **Pages** (in the left sidebar).
4. Under **Build and deployment**, set the Source to **Deploy from a branch**.
5. Select **`main`** branch and the root directory **`/`**, then click **Save**.
6. GitHub will build the site and provide a public URL (e.g., `https://<your-username>.github.io/<repo-name>/`) in ~30 seconds!

### 2. Deploy via Vercel (1-Click Deployment)
1. Sign up/log in to [Vercel](https://vercel.com/).
2. Click **Add New** ➔ **Project** ➔ Import your GitHub repository.
3. Keep the default settings (Framework Preset: **Other**, Build Command: empty, Output Directory: empty).
4. Click **Deploy**. Vercel will build and launch your application with continuous delivery!

### 3. Deploy via Netlify (Drag & Drop)
1. Go to [Netlify App](https://app.netlify.com/).
2. Drag and drop the `constituency-priorities` folder directly into the upload area on Netlify.
3. Your site goes live instantly on a secure, public URL!

---

## 💻 Running Locally

You do not need to install node packages or build compile scripts.
* **Option A (Double-Click)**: Simply double-click `index.html` to open it directly in Google Chrome via the `file://` protocol. (The entire codebase has been engineered to be 100% compatible with local file execution).
* **Option B (Local Web Server)**: Run a local server in the project folder to run it on `localhost`:
  * Using Node.js: `npx http-server`
  * Using Python: `python -m http.server 8080`

---

## 🏛️ MP Credentials Directory

To test the multi-constituency isolation, switch to the **MP Dashboard** and use any of the following credentials (all passwords are `admin`):

| MP ID | Constituency Name | Regional Coordinates Center |
| :--- | :--- | :--- |
| **`MP_PALNADU`** | Palnadu / Narasaraopet (Andhra Pradesh) | `[16.2366, 80.0531]` |
| **`MP_DELHI`** | New Delhi | `[28.6139, 77.2090]` |
| **`MP_HOWRAH`** | Howrah (West Bengal) | `[22.5850, 88.3475]` |
| **`MP_GUNTUR`** | Guntur (Andhra Pradesh) | `[16.3067, 80.4365]` |
| **`MP_HYDERABAD`** | Hyderabad (Telangana) | `[17.3850, 78.4867]` |

---

## 🌟 Key Features

### 1. Citizen Intake Portal
* **Continuous Voice Transcription**: Integrates the browser's Web Speech API to provide multi-lingual continuous speech-to-text input (supporting English, Hindi, and Telugu).
* **Defensive Address-Coordinate Geocoder**: Tracks address text inputs. If a user types a landmark (e.g. *"Delhi Railway Station"*), the system geocodes the address in the background to automatically segment and route the complaint to the correct constituency, overriding default coordinates.
* **Canvas Image Compression**: Uploaded photo proofs (e.g. potholes, blockades) are down-scaled to a maximum of `600px` and saved as optimized JPEGs (~40KB). This prevents crashes and bypasses the browser's strict `5MB` local storage limit.
* **AI Spam & Irrelevance Filters**: Simple conversational chatter or purely personal requests (like *"I want pizza"*) are filtered out automatically by the AI classifier to keep the MP's dashboard focused.

### 2. Emergency Escalation Overrides
* Programmatic keyword triggers bypass the AI spam filter for critical public safety issues (containing terms like *protest, blockade, strike, accident, jam, fire*), raising urgency to `8+/10` automatically.
* When critical complaints are submitted, the app alerts the user with simulated SMS/Email notifications sent to both the **MP hot-line** and the **relevant Municipal/Roads/Health Authority**.

### 3. MP Decision Dashboard
* **Constituency Isolation**: Segregates complaints so each logged-in MP only sees priority cards and markers specific to their constituency.
* **Pulsing Map Pins**: Leaflet.js interactive map displays circular pins color-coded by urgency (Red: Critical, Orange: High, Green: Moderate).
* **Clickable Image Viewer**: Clicking on card thumbnails or map popups launches a glassmorphic high-resolution overlay preview.
* **Resolution Stopwatch & SMS Alerts**: Calculates and displays resolution duration when marking a complaint resolved, prompting the MP for actions taken, and sending a simulated SMS completion notification back to the citizen.

---

## 🛠️ Technology Stack

* **Structure**: HTML5 Semantic markup.
* **Styling**: Glassmorphism CSS3 with custom variables and micro-animations.
* **Map Engine**: Leaflet.js mapped to CartoDB dark-matter responsive tile layers.
* **Audio Engine**: Web Speech API wrapper.
* **AI Engine API**: Google Generative AI (Gemini SDK) utilizing a cascading retry fallback pipeline (`gemini-3.1-flash` ➔ `gemini-2.5-flash` ➔ `gemini-1.5-flash`).
