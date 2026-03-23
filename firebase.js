import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyB8xTpqXoCCZIR0YB1NAlHvG1vXcjLNItE",
  authDomain: "finwise2-8b4eb.firebaseapp.com",
  projectId: "finwise2-8b4eb",
  storageBucket: "finwise2-8b4eb.firebasestorage.app",
  messagingSenderId: "605845586598",
  appId: "1:605845586598:web:67d56e07faddc154b7ea67",
  measurementId: "G-61GDCWDWNE"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Khởi tạo Database và xuất ra để file app.js dùng có thể dùng
export const db = getFirestore(app);
