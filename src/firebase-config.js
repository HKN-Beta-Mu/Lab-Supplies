/**
 * Public Firebase web-app configuration.
 *
 * Firebase uses these values to identify the browser app and project. They are
 * intentionally visible to users of the website and are not authorization
 * credentials. Never add Gemini keys, service-account keys, OAuth client
 * secrets, or backend credentials to this file.
 */
export const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyC2k6jx3MQ2b-SC0PUh6jUZRRYWGfu4uUU",
  authDomain: "lab-supplies-67dae.firebaseapp.com",
  projectId: "lab-supplies-67dae",
  storageBucket: "lab-supplies-67dae.firebasestorage.app",
  messagingSenderId: "633190942481",
  appId: "1:633190942481:web:6cea9d699a8c4c81a12eb0",
});

// LabKit is intentionally a single-account internal club application.
export const labKitAuthConfig = Object.freeze({
  accountEmail: "HKNLabSuppliesGatech@gmail.com",
});
