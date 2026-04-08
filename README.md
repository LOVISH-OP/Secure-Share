# 🔐 SecureShare – Privacy-First Encrypted File Sharing Platform

SecureShare is a full-stack MERN application focused on high-security file sharing. It enables users to upload files, encrypt them on the server, and share them via secure, password-protected, and time-sensitive links.

---

## 🚀 Features

### 🔒 Security First
* **AES-256 Encryption:** Files are encrypted at rest to ensure data privacy.
* **Password Protection:** Optional password layers for sensitive shared links.
* **Expiring Links:** (Coming Soon) Automatically invalidate links after a set duration.
* **Secure Validation:** Backend checks for file integrity and authorization before download.

### 📂 File Handling
* **Seamless Upload:** Drag-and-drop or click-to-upload functionality.
* **Unique Link Generation:** Instant, obfuscated URLs for sharing.
* **Raw Data Safety:** Files are handled as buffers to prevent unauthorized access on the server.

### 🎨 User Experience
* **Responsive Design:** Works across mobile, tablet, and desktop.
* **Modern UI:** Clean interface built with React and Bootstrap.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React.js, Bootstrap |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB |
| **Storage** | Multer (Local/Cloud Storage) |
| **Security** | AES-256 Encryption, Bcrypt (Password Hashing) |

---

## 🧠 Application Flow

The following diagram illustrates how data moves through SecureShare from upload to retrieval:



1.  **Upload:** User selects a file and optional password via the React frontend.
2.  **Encryption:** The Node.js backend receives the file, generates an encryption key, and applies AES-256 encryption.
3.  **Storage:** The encrypted file is saved to the server/cloud, and the metadata (including hashed passwords) is stored in MongoDB.
4.  **Sharing:** A unique ID is generated and returned to the user as a shareable URL.
5.  **Retrieval:** The recipient enters the password; the backend validates it, decrypts the file in memory, and serves the download.

---

## ⚙️ Installation & Setup

1. **Clone the repository**
   ```bash
   git clone [https://github.com/your-username/secureshare.git](https://github.com/your-username/secureshare.git)
   cd secureshare

Install Dependencies
Bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install


Environment Variables
Create a .env file in the root directory:
Code snippet
PORT=5000
MONGO_URI=your_mongodb_connection_string
ENCRYPTION_KEY=your_32_character_secret_key


Run the Application
Bash
# From the root directory
npm run dev



📊 Future Enhancements
[ ] Zero-Knowledge Encryption: Implement client-side encryption so the server never sees the raw file.
[ ] One-Time Downloads: Links that self-destruct after the first successful download.
[ ] Analytics Dashboard: Track how many times a link has been accessed.
[ ] Cloud Integration: Support for AWS S3 or Google Cloud Storage.

📄 License
Distributed under the MIT License. See LICENSE for more information.
