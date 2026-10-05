import {
  getApp,
  getApps,
  initializeApp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

export { app, auth };

// The existing application is currently made of classic browser scripts.
// Expose one narrow bridge so its login UI can use the initialized SDK without
// duplicating Firebase configuration or initialization code.
window.LabKitFirebase = Object.freeze({ app, auth });
window.dispatchEvent(new CustomEvent("labkit:firebase-ready"));
