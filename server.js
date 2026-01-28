const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ override: true }); // Load .env file

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from current directory
app.use(express.static(__dirname));

// --- Database Setup ---
// Connect to MongoDB (using a local instance or a cloud URI provided via env var, defaulting to local)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ark_project';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const GameStateSchema = new mongoose.Schema({
  teamId: { type: String, required: true, unique: true }, // 'A' or 'B'
  password: { type: String, required: true },
  progress: { type: [Boolean], default: [false, false, false, false, false] }, // 5 tasks
  scoreFields: { type: Object, default: {} },
  // specific locks or exclusive states can be stored here or derived
});

const GameState = mongoose.model('GameState', GameStateSchema);

// --- Global State for Timer & Referee ---
const GlobalStateSchema = new mongoose.Schema({
  id: { type: String, default: 'global', unique: true },
  startTime: { type: Number, default: null }, // Timestamp when timer started
  duration: { type: Number, default: 75 * 60 * 1000 }, // 75 minutes in ms
  isEnded: { type: Boolean, default: false }
});
const GlobalState = mongoose.model('GlobalState', GlobalStateSchema);

// Initialize Default State if empty
async function initDB() {
  const count = await GameState.countDocuments();
  if (count === 0) {
    await GameState.create({ teamId: 'A', password: 'a71b' }); // Default Pass for A
    await GameState.create({ teamId: 'B', password: 'a2b8' }); // Default Pass for B
  }
  
  const globalCount = await GlobalState.countDocuments();
  if (globalCount === 0) {
    await GlobalState.create({ id: 'global' });
    console.log('Initialized Global State');
  }
}
initDB();

// --- Timer Loop ---
setInterval(async () => {
  const global = await GlobalState.findOne({ id: 'global' });
  if (global && global.startTime && !global.isEnded) {
    const now = Date.now();
    const elapsed = now - global.startTime;
    if (elapsed >= global.duration) {
      global.isEnded = true;
      await global.save();
      io.emit('globalStateUpdate', global);
      console.log('Timer expired. Game Ended.');
    }
  }
}, 5000); // Check every 5 seconds

// --- Socket.io Logic ---

io.on('connection', (socket) => {
  console.log('A user connected');

  // Handle Login
  socket.on('login', async ({ teamId, password }) => {
    try {
      // Referee Login
      if (teamId === 'Referee') {
        if (password === 'yi94an713') {
          socket.join('referee');
          socket.emit('loginSuccess', { teamId: 'Referee', isReferee: true });
          
          // Send all states
          const allStates = await GameState.find();
          socket.emit('stateUpdate', allStates);
          const global = await GlobalState.findOne({ id: 'global' });
          socket.emit('globalStateUpdate', global);
          return;
        } else {
          socket.emit('loginError', '裁判密碼錯誤');
          return;
        }
      }

      // Team Login
      const team = await GameState.findOne({ teamId, password });
      if (team) {
        socket.join(teamId); // Join team room
        socket.emit('loginSuccess', { teamId });
        
        // Send current state of EVERYTHING to the newly logged in user
        const allStates = await GameState.find();
        socket.emit('stateUpdate', allStates);
        
        const global = await GlobalState.findOne({ id: 'global' });
        socket.emit('globalStateUpdate', global);
      } else {
        socket.emit('loginError', '密碼錯誤或隊伍不存在');
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Referee: Start Timer
  socket.on('adminStartTimer', async () => {
    try {
      const global = await GlobalState.findOne({ id: 'global' });
      if (global) {
        global.startTime = Date.now();
        global.isEnded = false;
        await global.save();
        io.emit('globalStateUpdate', global);
      }
    } catch (e) { console.error(e); }
  });

  // Referee: End Game
  socket.on('adminEndGame', async () => {
    try {
      const global = await GlobalState.findOne({ id: 'global' });
      if (global) {
        global.isEnded = true;
        // Optionally reset start time or keep it to show "time's up"
        await global.save();
        io.emit('globalStateUpdate', global);
      }
    } catch (e) { console.error(e); }
  });

  // Handle Progress Update
  socket.on('updateProgress', async ({ teamId, index, checked }) => {
    try {
      const team = await GameState.findOne({ teamId });
      if (team) {
        team.progress[index] = checked;
        // Mongoose doesn't always detect array changes by index
        team.markModified('progress'); 
        await team.save();
        
        // Broadcast new state to EVERYONE
        const allStates = await GameState.find();
        io.emit('stateUpdate', allStates);
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Handle Score Field Updates
  socket.on('updateScoreField', async ({ teamId, fieldId, value }) => {
    try {
      const team = await GameState.findOne({ teamId });
      if (team) {
        if (!team.scoreFields) team.scoreFields = {};
        team.scoreFields[fieldId] = value;
        team.markModified('scoreFields');
        await team.save();

        // Broadcast
        const allStates = await GameState.find();
        io.emit('stateUpdate', allStates);
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Handle Exclusive Locks (e.g. "First to Upload")
  // payload: { teamId, fieldId, value, opponentFieldId }
  socket.on('claimExclusive', async ({ teamId, fieldId, value, opponentTeamId, opponentFieldId }) => {
    try {
      // 1. Get both teams
      const team = await GameState.findOne({ teamId });
      const opponent = await GameState.findOne({ teamId: opponentTeamId });

      if (team && opponent) {
        // "First to Upload" Logic:
        // If I want to set YES (value='10' or '60'), check if opponent is already YES.
        // If opponent is YES, I cannot claim it.
        // If opponent is NO, I claim YES, and force opponent to NO (and they should be locked on UI side).
        
        const isClaiming = (value === '10' || value === '60' || value === '80'); // Adjust based on specific field logic
        
        if (isClaiming) {
            // Check if opponent already has the "winning" value
            // We need to know what the winning value is for the opponent field.
            // For simplicity, we assume if opponent has the same 'winning' value, we can't take it.
            // But here the logic is: "When one team selects YES, the other team CANNOT adjust and becomes NO".
            
            // So we force set:
            if (!team.scoreFields) team.scoreFields = {};
            if (!opponent.scoreFields) opponent.scoreFields = {};

            team.scoreFields[fieldId] = value;
            opponent.scoreFields[opponentFieldId] = '0'; // Or '50' depending on the field context... 
            // This is tricky because different fields have different "No" values (0 or 50).
            // We might need a more generic "forceValue" payload.
        } 
        
        // Actually, let's just update what the client sent, but we need to handle the locking server-side 
        // to prevent race conditions.
        // Simplified approach for this prototype: 
        // Client sends "I want to set X to Y". 
        // If X is a "First" field and Y is "Yes", Server checks if Opponent has "Yes".
        // If Opponent has "Yes", reject.
        // If not, accept and set Opponent to "No".
        
        // Let's implement a specific handler for the "First" fields to be safe.
      }
    } catch (err) {
      console.error(err);
    }
  });
  
  // A generic handler for specific "First" logic events might be cleaner
  socket.on('tryLockFirst', async ({ teamId, fieldId, winValue, loseValue, opponentTeamId, opponentFieldId }) => {
     try {
         const team = await GameState.findOne({ teamId });
         const opponent = await GameState.findOne({ teamId: opponentTeamId });
         
         if(team && opponent){
             const opponentVal = opponent.scoreFields ? opponent.scoreFields[opponentFieldId] : null;
             
             // If opponent already has the winValue, we fail (do nothing or emit error)
             if(opponentVal === winValue){
                 // Race condition lost
                 return;
             }
             
             // Otherwise, we win
             if (!team.scoreFields) team.scoreFields = {};
             if (!opponent.scoreFields) opponent.scoreFields = {};
             
             team.scoreFields[fieldId] = winValue;
             opponent.scoreFields[opponentFieldId] = loseValue;
             
             team.markModified('scoreFields');
             opponent.markModified('scoreFields');
             
             await team.save();
             await opponent.save();
             
             const allStates = await GameState.find();
             io.emit('stateUpdate', allStates);
         }
     } catch(e){ console.error(e); }
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
