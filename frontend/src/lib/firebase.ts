// firebase.ts
import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"

// Firebase 설정 (Firebase Console → 프로젝트 설정 → SDK 설정에서 복사)
const firebaseConfig = {
  apiKey: "AIzaSyBpkiIgZ2Z4Vy0LWaLrMUVDdiDkgSe4Bg8",
  authDomain: "drone-checklist-11fb7.firebaseapp.com",
  projectId: "drone-checklist-11fb7",
  storageBucket: "drone-checklist-11fb7.firebasestorage.app",
  messagingSenderId: "978230670244",
  appId: "1:978230670244:web:a75221e4d3799cb07c8731",
}

// Firebase 초기화
const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

export default app
