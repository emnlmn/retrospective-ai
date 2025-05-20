
import { EventEmitter } from 'events';

// Create a single, shared instance of EventEmitter
const emitter = new EventEmitter();

// Increase the default max listeners if you expect many concurrent SSE connections per board
// emitter.setMaxListeners(50); // Adjust as needed

export default emitter;
