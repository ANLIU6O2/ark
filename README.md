# 重建約櫃之旅 (Ark Journey Project)

這是一個基於 Node.js 與 Socket.io 開發的互動式網頁應用程式，專為「重建約櫃之旅」活動設計。系統包含即時進度追蹤、團隊評分以及任務管理功能。

## 功能特點

- **即時同步**：使用 Socket.io 達成多裝置間的即時狀態更新。
- **任務系統**：條列活動流程（十誡石版、嗎哪罐子、亞倫發芽的杖、約櫃）。
- **計分系統**：後端資料庫支援，記錄各隊伍的積分與進度。
- **響應式設計**：優化行動裝置體驗，適合戶外活動使用。

## 技術棧

- **前端**：HTML5, CSS3 (Modern UI/UX), JavaScript
- **後端**：Node.js, Express
- **資料庫**：MongoDB (透過 Mongoose)
- **即時通訊**：Socket.io

## 本地開發環境設定

1. **進入專案目錄**：
   ```bash
   cd ark
   ```

2. **安裝依賴套件**：
   ```bash
   npm install
   ```

3. **設定環境變數**：
   在 `ark` 目錄下建立 `.env` 檔案，內容如下：
   ```env
   MONGO_URI=您的MongoDB連線字串
   PORT=3000
   ```

4. **啟動伺服器**：
   ```bash
   npm start
   ```
   開啟瀏覽器訪問 `http://localhost:3000`

## 部署說明 (Render)

本專案已優化以支援 Render 平台部署：

- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Root Directory**: `.` (若從 `ark` 儲存庫部署) 或 `ark` (若從父目錄部署)
- **Environment Variables**: 務必在 Render 後台設定 `MONGO_URI`。

## 檔案結構

- `server.js`: 後端 Express 伺服器與 Socket.io 邏輯。
- `index.html`: 前端主介面與客戶端邏輯。
- `media/`: 存放活動相關影片與多媒體素材。
- `.gitignore`: 已設定排除 `node_modules` 與敏感的 `.env` 檔案。

---
© 2026 重建約櫃之旅 製作團隊
