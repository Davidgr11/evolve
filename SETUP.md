# Detailed Setup Guide

This guide provides step-by-step instructions for setting up Evolve locally and deploying to production.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Firebase Setup](#firebase-setup)
- [Local Development](#local-development)
- [Firebase Rules](#firebase-rules)
- [PWA Configuration](#pwa-configuration)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js**: v16 or higher ([Download](https://nodejs.org/))
- **npm** or **yarn**: Comes with Node.js
- **Firebase Account**: Create at [firebase.google.com](https://firebase.google.com/)
- **Git**: Optional but recommended

---

## Firebase Setup

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or **"Create a project"**
3. Enter project name: `evolve-app` (or your preferred name)
4. Disable Google Analytics (optional, you can enable it later)
5. Click **"Create project"**

### Step 2: Enable Authentication

1. In your Firebase project, go to **Build** → **Authentication**
2. Click **"Get started"**
3. Enable **Email/Password**:
   - Click on "Email/Password"
   - Toggle "Enable"
   - Click "Save"
4. Enable **Google Sign-In**:
   - Click on "Google"
   - Toggle "Enable"
   - Select a support email from the dropdown
   - Click "Save"

### Step 3: Create Firestore Database

1. Go to **Build** → **Firestore Database**
2. Click **"Create database"**
3. Select **"Start in test mode"** (we'll add security rules later)
4. Choose a location (select closest to your target users)
5. Click **"Enable"**

### Step 4: Enable Cloud Storage

1. Go to **Build** → **Storage**
2. Click **"Get started"**
3. Start in **test mode**
4. Choose the same location as Firestore
5. Click **"Done"**

### Step 5: Get Firebase Configuration

1. Go to **Project Settings** (gear icon near "Project Overview")
2. Scroll down to **"Your apps"** section
3. Click the web icon `</>`
4. Register app with nickname: `evolve-web`
5. **Don't** check "Firebase Hosting" yet
6. Click **"Register app"**
7. Copy the `firebaseConfig` object

Example configuration:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "evolve-app.firebaseapp.com",
  projectId: "evolve-app",
  storageBucket: "evolve-app.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

### Step 6: Configure Environment Variables

1. In your project root, create a `.env` file:

```bash
cp .env.example .env
```

2. Edit `.env` and add your Firebase credentials:

```env
VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=evolve-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=evolve-app
VITE_FIREBASE_STORAGE_BUCKET=evolve-app.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

**Important**: Never commit the `.env` file to git. It's already in `.gitignore`.

---

## Local Development

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

The app will be available at: `http://localhost:5173`

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `dist/` folder.

### Preview Production Build

```bash
npm run preview
```

---

## Firebase Rules

### Install Firebase CLI

```bash
npm install -g firebase-tools
```

### Login to Firebase

```bash
firebase login
```

### Initialize Firebase

```bash
firebase init
```

**Select the following:**
- ☑ Firestore
- ☑ Storage
- ☑ Hosting

**Configuration:**
- Use existing project: Select your project from the list
- Firestore rules file: `firestore.rules` (default)
- Firestore indexes file: `firestore.indexes.json` (default)
- Storage rules file: `storage.rules` (default)
- Public directory: `dist`
- Single-page app: `Yes`
- Automatic builds with GitHub: `No`

### Firestore Security Rules

The `firestore.rules` file ensures users can only access their own data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Storage Security Rules

The `storage.rules` file restricts file uploads to authenticated users:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null
                       && request.auth.uid == userId
                       && request.resource.size < 2 * 1024 * 1024; // 2MB limit
    }
  }
}
```

### Deploy Rules

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```

---

## PWA Configuration

### Icons

The app requires PWA icons for installation. Place these files in the `public/` folder:

- `icon-192x192.png` (192x192 pixels)
- `icon-512x512.png` (512x512 pixels)
- `apple-touch-icon.png` (180x180 pixels)

**Icon Generator Tools:**
- [PWA Builder](https://www.pwabuilder.com/imageGenerator)
- [RealFaviconGenerator](https://realfavicongenerator.net/)

**Recommended:**
- Use the brand color `#14b8a6` (teal) for backgrounds
- Simple, recognizable design
- High contrast for visibility

### Install as PWA

Once deployed to HTTPS, users can install Evolve:

- **Android**: Chrome shows an "Install" banner
- **iOS**: Safari → Share → "Add to Home Screen"
- **Desktop**: Install icon appears in address bar

---

## Deployment

### Deploy to Firebase Hosting

1. **Build the app:**
   ```bash
   npm run build
   ```

2. **Deploy:**
   ```bash
   firebase deploy
   ```

   Or deploy only hosting:
   ```bash
   firebase deploy --only hosting
   ```

3. Your app will be live at: `https://your-project-id.web.app`

### Custom Domain (Optional)

1. Go to Firebase Console → **Hosting**
2. Click **"Add custom domain"**
3. Enter your domain name
4. Follow DNS verification instructions
5. Add provided DNS records to your domain registrar
6. Wait for SSL certificate provisioning (can take 24 hours)

---

## Firestore Data Structure

```
users/
  {userId}/
    routines/
      {routineId}/
        - name: string
        - type: "stretch" | "workout" | "running" | "sports"
        - series: number
        - exercises: array
          - name: string
          - repetitions: string (optional)
          - imageUrl: string (optional)
          - imagePath: string (optional)
        - createdAt: timestamp

    statistics/
      move/
        {year}/
          {month}/
            - stretch: number
            - workout: number
            - running: number
            - sports: number
            - effort: array<number>
            - calories: number
            - km: number

      books/
        {year}/
          - count: number

    goals/
      {goalId}/
        - imageUrl: string
        - imagePath: string
        - description: string
        - status: "expecting" | "accomplished"
        - order: number
        - createdAt: timestamp

    yearlyVersions/
      {year}/
        - versionText: string
        - updatedAt: timestamp

    food/
      data/
        - mealPlan:
            breakfast: array
            snacks: array
            meal: array
            dinner: array
        - shoppingList: array
        - weightHistory: array

    books/
      {bookId}/
        - title: string
        - description: string
        - status: "read" | "reading" | "to read" | "interested"
        - finishedDate: string (optional)
        - createdAt: timestamp

    settings/
      profile/
        - photoUrl: string
        - imagePath: string

      motivationalQuote/
        - quote: string
```

---

## Storage Structure

```
users/
  {userId}/
    exercises/
      {timestamp}_{filename}
    recipes/
      {timestamp}_{filename}
    goals/
      {timestamp}_{filename}
    profile/
      {timestamp}_{filename}
```

---

## Troubleshooting

### Firebase Connection Issues

**Error**: "Firebase: Error (auth/configuration-not-found)"

**Solution:**
- Verify `.env` file exists in project root
- Check all environment variables start with `VITE_`
- Restart dev server after changing `.env`
- Ensure `.env` values match Firebase console exactly

**Error**: "Missing or insufficient permissions"

**Solution:**
- Deploy Firestore and Storage rules
- Verify rules syntax is correct
- Check user is authenticated
- Ensure userId in path matches authenticated user

### Build Issues

**Error**: Module not found

**Solution:**
```bash
rm -rf node_modules
rm package-lock.json
npm install
```

**Error**: Vite build fails

**Solution:**
```bash
npm run build -- --debug
```
Review error messages and ensure all imports are correct.

### PWA Not Installing

**Issues:**
- PWA requires HTTPS (works on localhost or deployed site)
- Ensure all icons exist in `public/` folder
- Check `manifest.json` is accessible
- Verify service worker is registered

**Solution:**
1. Deploy to Firebase Hosting (automatic HTTPS)
2. Check browser DevTools → Application → Manifest
3. Verify icons load without errors
4. Test on different browsers

### Image Upload Issues

**Error**: Images not uploading

**Solution:**
- Check file size is under 2MB
- Verify Storage rules are deployed
- Ensure user is authenticated
- Check browser console for specific errors
- Verify Storage bucket exists in Firebase

**Error**: Images display broken

**Solution:**
- Check imageUrl is saved correctly in Firestore
- Verify Storage CORS settings
- Ensure Storage rules allow read access
- Check browser DevTools → Network tab

### Authentication Issues

**Error**: Google Sign-In not working

**Solution:**
- Verify Google auth is enabled in Firebase Console
- Check authorized domains include your domain
- For localhost, ensure it's in authorized domains
- Clear browser cache and cookies

**Error**: Email/Password sign-up fails

**Solution:**
- Check Email/Password auth is enabled
- Verify password meets requirements (min 6 characters)
- Check Firebase quota hasn't been exceeded
- Review Firebase Console → Authentication for error details

---

## Performance Optimization

### Image Compression

Images are automatically compressed before upload:
- Max size: 1MB (compressed from 2MB uploads)
- Max dimension: 1024px for exercises/goals, 512px for profile photos
- Format: Original format preserved
- Library: browser-image-compression

### Database Optimization

- Use pagination for large lists
- Index commonly queried fields
- Minimize real-time listeners
- Cache static data locally

### Bundle Size

Monitor with:
```bash
npm run build
```

Check `dist/` folder size and review Vite build output.

---

## Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Vite Documentation](https://vitejs.dev/)
- [React Router Documentation](https://reactrouter.com/)
- [TailwindCSS Documentation](https://tailwindcss.com/)
- [Recharts Documentation](https://recharts.org/)

---

## Getting Help

If you encounter issues:

1. Check this guide's Troubleshooting section
2. Review Firebase Console for errors
3. Check browser DevTools console
4. Search existing GitHub issues
5. Open a new issue with:
   - Error message
   - Steps to reproduce
   - Browser and OS version
   - Screenshots if applicable

---

<p align="center">Need more help? Open an issue on GitHub!</p>
