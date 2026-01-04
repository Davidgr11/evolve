# Evolve 🚀

> Build the Life You Envision

A modern Progressive Web App for tracking fitness, goals, nutrition, and personal growth. Take control of your daily habits and visualize your journey.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react)](https://reactjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Powered-FFCA28?logo=firebase)](https://firebase.google.com/)
[![Vite](https://img.shields.io/badge/Vite-Latest-646CFF?logo=vite)](https://vitejs.dev/)

---

## ✨ Features

### 🏃 Move

- **Workout Routines**: Create custom routines with exercises, series, and images
- **Live Timer**: Real-time execution with pause/resume capability
- **Activity Tracking**: Track stretching, workouts, running, and sports
- **Statistics**: Monthly and yearly progress with effort, calories, and distance metrics

### 🎯 Goals

- **Vision Board**: Visual representation with up to 20 goal images
- **Yearly Versions**: Define who you want to become each year
- **Progress History**: Track and compare your evolution across years
- **Move Dashboard**: Comprehensive statistics and performance metrics

### 🍎 Food

- **Meal Planning**: Organize recipes across breakfast, snacks, meals, and dinner
- **Weight Tracker**: Visual chart showing your weight journey
- **Shopping List**: Smart list with purchase tracking and reset functionality
- **Recipe Management**: Store recipes with images and descriptions

### 📚 Books

- **Reading Tracker**: Organize books by status (read, reading, to-read, interested)
- **Annual Statistics**: Visual bar charts showing reading progress by year
- **Completion Tracking**: Record finish dates and reading history

### 👤 Profile

- **Motivational Quotes**: Set inspiring quotes to fuel your journey
- **User Settings**: Manage account, theme preferences, and profile photo
- **Dark Mode**: Eye-friendly interface for day and night use

---

## 🛠️ Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: TailwindCSS
- **Backend**: Firebase (Auth, Firestore, Storage, Hosting)
- **Routing**: React Router v6
- **Forms**: react-hook-form
- **Charts**: Recharts
- **PWA**: vite-plugin-pwa

---

## 🚀 Quick Start

### Prerequisites

- Node.js 16+
- Firebase account
- npm or yarn

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/evolve.git
   cd evolve
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up Firebase**

   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com/)
   - Enable Authentication (Email/Password & Google)
   - Create a Firestore database
   - Enable Cloud Storage
   - Copy your Firebase config

4. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your Firebase credentials:

   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

5. **Deploy Firebase rules**

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init
   firebase deploy --only firestore:rules,storage:rules
   ```

6. **Start development server**

   ```bash
   npm run dev
   ```

   Visit `http://localhost:5173`

---

## 📦 Build & Deploy

### Build for Production

```bash
npm run build
```

### Deploy to Firebase Hosting

```bash
firebase deploy
```

Your app will be live at `https://your-project-id.web.app`

---

## 📱 PWA Installation

Once deployed, users can install Evolve as a native app:

- **Android**: Chrome will show an install banner
- **iOS**: Safari → Share → "Add to Home Screen"
- **Desktop**: Install icon in browser address bar

---

## 📂 Project Structure

```
evolve/
├── src/
│   ├── components/     # Reusable UI components
│   ├── contexts/       # React contexts (Auth, Theme)
│   ├── pages/          # Main app pages
│   ├── utils/          # Firebase config & utilities
│   └── App.jsx         # Main app component
├── public/             # Static assets & PWA icons
├── firestore.rules     # Database security rules
├── storage.rules       # Storage security rules
└── vite.config.js      # Vite configuration
```

---

## 🔒 Security

- User data is isolated with Firestore security rules
- Image uploads limited to 2MB per file
- Authentication required for all operations
- HTTPS enforced in production

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Lucide Icons](https://lucide.dev/)
- [Recharts](https://recharts.org/)
- [TailwindCSS](https://tailwindcss.com/)
- [Firebase](https://firebase.google.com/)
- [Vite](https://vitejs.dev/)

---

## 📧 Support

For issues and questions:

- Open an issue on GitHub
- Check the [detailed setup guide](SETUP.md)
- Review Firebase, Vite, and React documentation

---

<p align="center">Made with ❤️ for personal growth and productivity</p>
