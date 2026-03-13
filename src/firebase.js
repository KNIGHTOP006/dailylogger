import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC5FYZ10AbnOtsxxU47DXam0RHqe4zlp_Q",
  authDomain: "daily-logger-main.firebaseapp.com",
  projectId: "daily-logger-main",
  storageBucket: "daily-logger-main.firebasestorage.app",
  messagingSenderId: "998429717846",
  appId: "1:998429717846:web:5541a970ecb873de66d2f7",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);