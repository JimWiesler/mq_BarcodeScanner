'use strict';
//*******************************************************
// Opens and listens on an Intermec Scanner SR31T2D in Virtual COM mode
//*******************************************************
//Load required modules
// const repl = require('repl');
const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');
const EventEmitter = require('events');

//*******************************************
// IntermecScanner Class
//*******************************************
class IntermecScanner extends EventEmitter {
    constructor(cfg) {
        super();
        this.state = 'Closed'; // See State Machine: Closed, Opening, Offline, Initializing, Online, Closing
        this.cfg = cfg;
        this.port = null;
        this.readParser = null;
    }

    // Open port
    open() {
        const me = this;
        try {
            this.port = new SerialPort(this.cfg.tty, {
                baudRate: this.cfg.baudrate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
              });
            this.readParser = this.port.pipe(new Readline({ delimiter: '\r' }));
            this.readParser.on('data', function (data) {
                me.read(data);
            });
            this.port.on('error', function(error) {
                me.emit('error', { utc: utc(), payload: 'Port Error: '+ error });
                me.close();
            });
            this.port.on('close', function(res) {
                me.setState('Closed');
            });
            this.setState('Online');
        } catch (error) {
            this.emit('error', { utc: utc(), payload: 'Port Failed to open: ', error });
            this.setState('Closed');
        }
    }

    // Close port
    close() {
        this.setState('Closing');
        if (this.port.isOpen) {
            this.port.close(); // Note - Close event handler will manage the state change to Closed
        } else {
            this.setState('Closed');
        }
    }

    // State management
    setState(newState) {
        console.log('setState ==> Old State: '+this.state+' New State: '+newState);
        this.state = newState;
        this.emit("state", { utc: utc(), payload: this.state} );
    }

    // All read handling
    read(inp) {
        // Clean up the input by trimming and deleting any CR LF or ESC characters
        inp = inp.replace('\n','').replace('\r','').replace('\x1B', '').trim(); // LF, CR, ESC, white space
        if (inp.length === 0) return; // Ignore blank lines

        // Send event that new input received
        this.emit('rx', { utc: utc(), payload: inp });
    }

}

// Utility functions
function utc() { // Generate ISO string of current date/time in UTC
    return (new Date().toISOString());
}

module.exports.IntermecScanner = IntermecScanner;

// Leaving this in as comments
// const r = new IntermecScanner({ tty: '/dev/ttyACM0', baudrate: 57600 });
// r.on('error', (res) => console.log('Event->error:', res));
// r.on('state', (res) => console.log('Event->state:', res));
// r.on('rx', (res) => console.log('Event->rx:', res));
// repl.start('> ').context.r = r;
