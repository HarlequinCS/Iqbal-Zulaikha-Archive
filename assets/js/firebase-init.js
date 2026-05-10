/* =========================================================
   Firebase init — Firestore-ready
   Loaded as ES module from Google CDN (works on GitHub Pages,
   no build step required).
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  writeBatch,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCRGscvf2w5tr2-S3KVIYHqzUVSgb9m08s",
  authDomain: "iqbal-zulaikha-archive.firebaseapp.com",
  projectId: "iqbal-zulaikha-archive",
  storageBucket: "iqbal-zulaikha-archive.firebasestorage.app",
  messagingSenderId: "921884184813",
  appId: "1:921884184813:web:559f2bb1d35a1b64be7ce4",
};

export const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);

export const fs = {
  collection,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  writeBatch,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
};

if (typeof window !== "undefined") {
  window.firebaseApp = app;
  window.firebaseDb  = db;
  window.firebaseFs  = fs;
}
