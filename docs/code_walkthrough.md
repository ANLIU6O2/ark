# 超詳解：逐行程式碼導讀 (Line-by-Line Walkthrough)

這份文件將帶您幾乎一行一行地閱讀 `server.js` (後端) 與 `index.html` (前端邏輯)，並解釋每個函數、變數與 Library 方法的用途。

建議您將此文件與程式碼 **左右並排** 對照閱讀。

---

## 第一部分：後端伺服器 (`server.js`)

這是整個應用程式的「大腦」，負責資料存儲與即時通訊。

### 1. 引入模組 (Dependencies)
```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ override: true });
```
*   `require('express')`: 引入 **Express** 框架。這是 Node.js 最流行的 Web 框架，用來處理網址請求。
*   `require('http')`: Node.js 內建的 HTTP 模組。雖然 Express 本身能處理 HTTP，但為了配合 Socket.io，我們需要直接操作底層的 HTTP Server。
*   `const { Server } = require('socket.io')`: 從 **Socket.io** 庫中只取出 `Server` 這個類別。這是用來建立 WebSocket 伺服器的核心。
*   `require('mongoose')`: 引入 **Mongoose**。這是一個用來操作 **MongoDB** 資料庫的工具（ORM），讓我們可以用 JavaScript 物件的方式來操作資料庫，而不用寫複雜的資料庫語法。
*   `require('dotenv').config(...)`: 讀取專案根目錄下的 `.env` 檔案。這很重要，因為我們通常把敏感資料（如資料庫連線密碼）放在 `.env` 裡，不寫死在程式碼中。

### 2. 初始化伺服器
```javascript
const app = express();
const server = http.createServer(app);
const io = new Server(server);
```
*   `const app = express()`: 建立一個 Express 應用程式實體。
*   `http.createServer(app)`: 建立一個標準的 HTTP 伺服器，並把 `app` (Express) 掛載上去。這樣一般的網頁請求會由 Express 處理。
*   `const io = new Server(server)`: **關鍵！** 把 HTTP 伺服器 (`server`) 交給 Socket.io (`io`) 接管。這樣同一個 Port (例如 3000) 可以同時處理「看網頁」和「即時通訊」兩種請求。

### 3. 設定靜態檔案
```javascript
app.use(express.static(__dirname));
```
*   `app.use(...)`: 這是 Express 的「中間件 (Middleware)」語法，意思是指對每一個請求都要執行這個功能。
*   `express.static(...)`: 這是一個內建功能，用來提供靜態檔案（HTML, CSS,圖片,影片）。
*   `__dirname`: 這是一個 Node.js 全域變數，代表「目前這個 server.js 檔案所在的資料夾路徑」。
*   **翻譯**：「如果有使用者請求網址，去我現在這個資料夾找找看有沒有對應的檔案，有的話直接傳給他。」

### 4. 資料庫連線 (Database Connection)
```javascript
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ark_project';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));
```
*   `process.env.MONGO_URI`: 嘗試讀取環境變數裡的連線字串。
*   `||`: 邏輯「或」。如果環境變數沒設定，就使用後面的預設值 (本機資料庫 `mongodb://...`)。
*   `mongoose.connect(...)`: **非同步方法**。開始嘗試連線資料庫。它會回傳一個 Promise。
*   `.then(...)`: 連線成功後會執行的函式。
*   `.catch(...)`: 連線失敗會執行的函式（印出錯誤）。

### 5. 定義資料結構 (Schemas)
```javascript
const GameStateSchema = new mongoose.Schema({
  teamId: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  progress: { type: [Boolean], default: [false, false, false, false, false] },
  scoreFields: { type: Object, default: {} },
});
const GameState = mongoose.model('GameState', GameStateSchema);
```
*   `new mongoose.Schema(...)`: 定義資料庫裡的「文件」長什麼樣子。
*   `progress`: 定義為 `[Boolean]`（布林陣列），預設 5 個 `false`，代表 5 個關卡都還沒過。
*   `scoreFields`: 定義為 `Object`，用來彈性存儲各種分數（例如 `{ "ab1_score": 50 }`）。
*   `mongoose.model(...)`: 建立一個 Model。以後我們就可以用 `GameState.find()`, `GameState.create()` 來操作資料庫了。

### 6. 初始化資料 (Init DB)
```javascript
async function initDB() {
  const count = await GameState.countDocuments();
  if (count === 0) {
    await GameState.create({ teamId: 'A', password: 'a71b' });
    // ...略
  }
}
initDB();
```
*   `async function`: 定義一個非同步函式，因為裡面要讀寫資料庫，需要等待 (`await`)。
*   `await GameState.countDocuments()`: 等待資料庫告訴我目前有幾筆資料。
*   `if (count === 0)`: 如果資料庫是空的（第一次執行專案），就自動建立 A 組和 B 組的帳號密碼。

### 7. 計時器迴圈 (Timer Loop)
```javascript
setInterval(async () => {
  const global = await GlobalState.findOne({ id: 'global' });
  if (global && global.startTime && !global.isEnded) {
    const now = Date.now();
    const elapsed = now - global.startTime;
    if (elapsed >= global.duration) {
      global.isEnded = true;
      await global.save();
      io.emit('globalStateUpdate', global);
    }
  }
}, 5000);
```
*   `setInterval(..., 5000)`: 每 5000 毫秒（5秒）執行一次裡面的程式碼。
*   `GlobalState.findOne(...)`: 撈取全域設定。
*   `Date.now()`: 取得現在的時間戳記 (毫秒)。
*   `io.emit('globalStateUpdate', global)`: **重要！** 如果發現時間到了 (`isEnded = true`)，立刻用 WebSocket 廣播給「所有人」說遊戲結束了。

### 8. Socket.io 事件處理 (核心互動)
```javascript
io.on('connection', (socket) => {
  console.log('A user connected');
```
*   `io.on('connection')`: 這是 Socket.io 的總機。每當有一個瀏覽器連上來，這裡就會觸發一次。
*   `socket`: 這個變數代表「這一個特定的連線者」。

#### 登入事件
```javascript
  socket.on('login', async ({ teamId, password }) => {
    // ... (省略 Referee 判斷)
    const team = await GameState.findOne({ teamId, password });
    if (team) {
      socket.join(teamId); 
      socket.emit('loginSuccess', { teamId });
      
      const allStates = await GameState.find();
      socket.emit('stateUpdate', allStates);
    }
    // ...
  });
```
*   `socket.on('login', ...)`: 監聽這個使用者傳來的 'login' 事件。
*   `socket.join(teamId)`: 這是 Socket.io 的強大功能「房間 (Rooms)」。把這個人加入 'A' 房間。以後我可以只對 'A' 房間廣播。
*   `socket.emit('loginSuccess')`: 告訴「這個使用者」登入成功。
*   `socket.emit('stateUpdate', allStates)`: **關鍵同步**。一登入馬上把目前最新的所有隊伍資料傳給他，確保他看到的畫面是最新的。

#### 進度更新 (Update Progress)
```javascript
  socket.on('updateProgress', async ({ teamId, index, checked }) => {
      const team = await GameState.findOne({ teamId });
      if (team) {
        team.progress[index] = checked;
        team.markModified('progress'); 
        await team.save();
        
        const allStates = await GameState.find();
        io.emit('stateUpdate', allStates);
      }
  });
```
*   `team.progress[index] = checked`: 修改記憶體中的資料。
*   `team.markModified('progress')`: **Mongoose 特性**。因為 `progress` 是一個陣列，有時候只改陣列裡的一個值，Mongoose 偵測不到變化，所以我們要手動告訴它「這一欄改過了」。
*   `await team.save()`: 寫入資料庫。
*   `io.emit('stateUpdate', allStates)`: **廣播**。因為有人進度變了，我要通知「所有人」（包括對手），讓他們的畫面上也能看到進度條的變化。

---

## 第二部分：前端邏輯 (`index.html` 裡的 `<script>`)

### 1. 建立連線
```javascript
const socket = io();
```
*   這行程式碼依賴於 `<script src="/socket.io/socket.io.js"></script>`。
*   它會自動去尋找發送這個網頁的伺服器，並建立 WebSocket 長連線。

### 2. 接收狀態更新 (Render UI)
這是前端最複雜也最重要的函式 `updateScoreboard` (包含您修改的鎖定邏輯)。

```javascript
    function updateScoreboard(allStates) {
      // ... (取得 A 隊和 B 隊的資料)
      
      scoreFieldIds.forEach(id => {
        const el = document.getElementById(id); // 取得網頁上的輸入框元素
        
        // ... (省略遊戲結束判斷)

        if (myTeamId !== 'Referee') {
            // Rule 1: 只能改自己隊伍的分數
            if(fieldBelongsTo !== myTeamId) {
              el.disabled = true;
            } else {
               // Rule 3 (您新增的邏輯): 檢查進度條是否勾選
               let progressUnlocked = true;
               
               // 解析這個欄位屬於第幾個任務 (例如 ab1 -> 0, ab2 -> 1)
               let taskIdx = -1;
               const match = id.match(/_ab([1-5])_/);
               if(match) {
                   taskIdx = parseInt(match[1]) - 1;
               }
               
               // 如果有對應到任務，且該任務在進度陣列中是 false
               if (taskIdx >= 0) {
                   const myState = (myTeamId === 'A') ? teamA : teamB;
                   if (myState && myState.progress && !myState.progress[taskIdx]) {
                       progressUnlocked = false;
                   }
               }

               // 決定是否鎖定
               if (!progressUnlocked) {
                   el.disabled = true; // 鎖定！
                   el.title = "請先勾選上方對應的進度關卡"; // 游標移上去會顯示提示
               } else {
                   el.disabled = false; // 解鎖！
               }
            }
            // ...
        }
      });
    }
```
*   `allStates`: 這是從伺服器傳來的最新完整資料陣列。
*   `document.getElementById(id)`: 標準 DOM 操作，抓取網頁上的元素。
*   `el.disabled = true`: HTML 屬性，設為 true 後使用者就無法點擊或輸入。
*   邏輯解說：
    1.  先看這個欄位是不是我的隊伍的？(不是 -> 鎖)
    2.  再看這個欄位對應的任務 (AB1~AB5) 在 `myState.progress` 裡是不是 `true`？(不是 -> 鎖)
    3.  只有同時滿足「是我的隊伍」且「任務已勾選」，輸入框才會解鎖 (`disabled = false`)。

### 3. 發送事件 (Event Emitters)
```javascript
    // Checkboxes 監聽
    checks.forEach((ch, idx) => {
      ch.addEventListener('click', (e) => {
        // ... (順序檢查邏輯)
        
        // 發送給伺服器
        socket.emit('updateProgress', { teamId: myTeamId, index: idx, checked: ch.checked });
      });
    });

    // Score Fields 監聽
    scoreFieldIds.forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('change', () => {
         // 當數值改變時，發送給伺服器
         socket.emit('updateScoreField', { teamId: myTeamId, fieldId: id, value: el.value });
      });
    });
```
*   `addEventListener('click')`: 當使用者點擊時觸發。
*   `socket.emit(...)`: 這是前端 **唯一** 能改變資料的方式。前端**不直接**修改自己的畫面（除了暫時的 UI 反饋），而是告訴伺服器「我改了喔」，然後等待伺服器廣播「好，大家都更新」的指令回來 (`socket.on('stateUpdate')`)，這樣才能確保所有人的畫面都是同步且一致的。

---

## 總結
1.  **Server** 負責持有唯一的正確資料 (Source of Truth)。
2.  **Client (Index.html)** 負責顯示和發送使用者的動作。
3.  **Socket.io** 是兩者之間的橋樑，讓資料變更可以在毫秒等級內同步到所有連線裝置。
4.  **Mongoose** 確保資料被持久化保存到硬碟，就算伺服器重開，進度也不會不見。
