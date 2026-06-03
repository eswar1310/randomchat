# Chatibb - Real-time Anonymous Chat

A real-time, zero-registration anonymous chat application built with Express and Socket.IO.

## Deployment Guide (Render & Railway)

To host Chatibb publicly so anyone can use it, you can deploy the unified application to Render or Railway.

### Step 1: Initialize a Git Repository & Push to GitHub

1. Open your terminal in the `chatibb` folder.
2. Initialize Git:
   ```bash
   git init
   ```
3. Stage and commit files:
   ```bash
   git add .
   git commit -m "Initialize real-time Chatibb application"
   ```
4. Create a new repository on GitHub (e.g. `chatibb`), then link and push:
   ```bash
   git remote add origin https://github.com/yourusername/chatibb.git
   git branch -M main
   git push -u origin main
   ```

---

### Step 2: Deploy to Render (render.com)

1. Log in to your **Render** dashboard.
2. Click **New +** and select **Web Service**.
3. Connect your GitHub account and choose the **chatibb** repository.
4. Set the following settings:
   - **Name:** `chatibb`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Select the **Free** instance type.
6. Click **Deploy Web Service**. Render will build and deploy the application, and provide you with a public URL (e.g., `https://chatibb.onrender.com`).

---

### Step 3: Deploy to Railway (railway.app)

1. Log in to **Railway**.
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your **chatibb** repository.
4. Railway will automatically detect the Node.js project and deploy it.
5. Once deployed, go to the service's **Settings** tab and click **Generate Domain** under the **Networking** section to get your public URL (e.g., `https://chatibb.up.railway.app`).
