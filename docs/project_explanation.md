# 專案詳解：尋回榮耀 重建約櫃之旅

這份文件詳細解釋了本專案（一個互動式網頁應用程式）的架構、程式碼邏輯以及使用的技術庫。

## 1. 專案概述

這是一個 **即時互動的網頁應用程式 (Real-time Web Application)**，設計用於團體活動（尋寶遊戲/Scavenger Hunt）。
*   **使用者角色**：A 組、B 組、裁判 (Referee)。
*   **核心功能**：即時倒數計時、任務進度同步、計分板（含互斥邏輯）、即時狀態更新。
*   **技術核心**：Node.js (後端運算), Express (網頁伺服器), Socket.io (即時通訊), MongoDB (資料儲存)。

---

## 2. 檔案結構與用途

```
ark/
├── .env                # 環境變數設定（存放敏感資訊，如資料庫連線字串）
├── .gitignore          # Git 忽略清單（忽略 node_modules 等不需要上傳的檔案）
├── index.html          # 前端入口（單頁應用程式，包含所有介面與邏輯）
├── package.json        # 專案設定檔（定義依賴套件、啟動指令）
├── server.js           # 後端伺服器核心（處理連線、資料庫邏輯、Socket 事件）
└── media/              # 存放影片與靜態資源
```

---

## 3. 後端詳解 (`server.js`)

後端負責協調所有客戶端（手機、平板），並確保資料一致。

### 核心技術與 Libraries

1.  **Express (`const express = require('express')`)**
    *   **用途**：快速建立 Web Server。
    *   **程式碼解析**：
        *   `app.use(express.static(__dirname))`：這行非常重要。它告訴 Express 把目前的資料夾當作「靜態檔案」伺服器。這樣使用者只要訪問網址，瀏覽器就能自動下載 `index.html`、`media/` 裡的影片。

2.  **Socket.io (`const { Server } = require('socket.io')`)**
    *   **用途**：建立 WebSocket 連線，讓伺服器可以**主動**推播訊息給瀏覽器（不用瀏覽器一直重新整理）。
    *   **關鍵方法**：
        *   `io.on('connection', socket => ...)`：當有人打開網頁時觸發。
        *   `socket.on('eventName', data => ...)`：監聽客戶端傳來的事件（如：有人登入、有人勾選任務）。
        *   `io.emit('eventName', data)`：廣播訊息給**所有人**（同步狀態）。
        *   `socket.emit(...)`：只傳訊息給**特定那個人**（如：登入失敗）。

3.  **Mongoose (`const mongoose = require('mongoose')`)**
    *   **用途**：用來操作 MongoDB 資料庫。在這個專案中，我們用它來儲存隊伍的狀態（分數、進度）和全局計時器。
    *   **Schema (資料模型)**：
        *   `GameStateSchema`：存隊伍 ID (`A`, `B`)、密碼、進度 (`progress` 陣列)、分數欄位 (`scoreFields` 物件)。
        *   `GlobalStateSchema`：存計時器開始時間 (`startTime`) 和遊戲是否結束 (`isEnded`)。

### 關鍵邏輯流程

*   **初始化 (`initDB`)**：伺服器啟動時，檢查資料庫是否為空。如果是空的，會自動建立 A 組、B 組的預設帳號與密碼。
*   **登入 (`socket.on('login')`)**：
    *   接收 `teamId` 和 `password`。
    *   去資料庫找有沒有符合的。
    *   如果有，用 `socket.join(teamId)` 把這個連線加入群組（方便未來針對特定隊伍廣播），並回傳 `loginSuccess`。
    *   **重點**：一登入成功，馬上把最新的 `allStates` (所有隊伍狀態) 傳給這個人，讓他畫面同步。
*   **狀態更新 (`updateProgress`, `updateScoreField`)**：
    *   當收到客戶端更新請求，先去資料庫修改對應的欄位。
    *   **儲存 (`save()`)** 後，立刻執行 `io.emit('stateUpdate', allStates)`。這就是為什麼 A 組勾選，B 組也能馬上看到進度條變動的原因。

---

## 4. 前端詳解 (`index.html`)

這是一個 **單頁應用程式 (SPA)**，所有畫面切換（登入 -> 主畫面）都在同一個頁面完成。

### HTML 結構
*   `#loginModal`：覆蓋全螢幕的登入視窗。
*   `.nav` (導覽列)：固定在上方，顯示計時器 (`#mainTimer`) 和導航連結。
*   `section`：將內容分為 Story (故事), Props (道具), Rules (規則), Tasks (任務), Score (分數)。
*   `<details>` 與 `<summary>`：用來製作可折疊的任務卡片，讓畫面更整潔。

### JavaScript 邏輯 (與 Socket.io 互動)

1.  **連線與狀態同步**
    *   `const socket = io();`：這行程式碼會自動連線到我們的 `server.js`。
    *   `socket.on('stateUpdate', (allStates) => ...)`：這是前端最核心的函式。
        *   每當伺服器說「資料變了」，這函式就會執行。
        *   它會根據回傳的資料，把勾選框 (`checkbox`) 勾上或取消，把分數填入欄位。
        *   **互斥鎖邏輯**：它會檢查 `myTeamId` (我是誰)，如果這欄位不屬於我，就用 `disabled = true` 鎖住不讓我改。
        *   **進度鎖邏輯 (您剛才修改的部分)**：它會檢查 `taskIdx` (任務索引) 的進度是否已完成。如果沒完成 (`progress[taskIdx] == false`)，對應的分數欄位會被鎖定。

2.  **事件監聽 (Event Listeners)**
    *   **勾選進度**：當使用者點擊 checkbox，不會直接改畫面，而是 `socket.emit('updateProgress', ...)` 告訴伺服器。等待伺服器廣播回來 update 事件，畫面才會真的變更（確保作弊無效）。
    *   **輸入分數**：監聽 `change` 或 `blur` 事件，將數值送回伺服器。

3.  **計時器**
    *   伺服器只存 `startTime` (開始的時間戳記)。
    *   前端透過 `setInterval` 每秒計算 `現在時間 - startTime`，動態顯示剩餘時間。這樣即使重新整理網頁，時間也不會跑掉。

---

## 5. 為什麼這樣寫？ (設計哲學)

1.  **Single Source of Truth (單一真理來源)**：
    *   所有的狀態（分數、進度、時間）都以 **資料庫 (MongoDB)** 為準。
    *   前端只負責「顯示」和「發送請求」。前端不自己保存狀態，這樣可以避免 A 手機顯示 10 分，B 手機顯示 20 分的衝突。

2.  **即時性 (Socket.io vs AJAX)**：
    *   如果是傳統網頁 (AJAX)，你需要一直按 F5 重新整理才能看到對手進度。
    *   用 Socket.io，伺服器可以主動推播。這對「競賽」類型的應用至關重要，因為你需要馬上知道對手是不是完成了某一關。

3.  **防呆與防作弊**：
    *   **鎖定邏輯**：我們在前端加入了大量的 `disabled` 判斷。例如：不能改對手的分數、不能在沒完成任務時填分。
    *   雖然目前的實作主要在前端防護，但配合後端廣播機制，任何人的修改都會被所有人看到，這本身就是一種社交監控（Social Monitoring）。

## 6. 使用到的 Library 方法總整理

*   **Express**
    *   `app.use()`: 掛載中間件 (Middleware)。
    *   `app.listen()`: 啟動伺服器監聽 Port。
*   **Socket.io (Client端 - index.html)**
    *   `socket.emit('event', data)`: 發送資料給伺服器。
    *   `socket.on('event', callback)`: 接收伺服器資料。
*   **Socket.io (Server端 - server.js)**
    *   `io.emit()`: 廣播給所有人。
    *   `socket.join('room')`: 加入特定群組 (如 'A' 組)。
*   **Mongoose**
    *   `mongoose.connect()`: 連線資料庫。
    *   `Model.findOne()`: 找一筆資料。
    *   `Model.find()`: 找所有資料。
    *   `doc.save()`: 儲存變更。
