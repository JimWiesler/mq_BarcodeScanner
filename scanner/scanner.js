"use strict";
const mqtt = require('mqtt');
const os = require("os");
const repl = require("repl");
const IntermecScanner = require('./IntermecScanner').IntermecScanner;

const hostname = os.hostname();
//*****************************
// Environment variabless
// TTY: '/dev/ttyUSB0'
// MQTT_EDGE_NODE_ID: hostname
// MQTT_DEVICE_ID: 'SCAN9999X'
// MQTT_HOST_IP: 'mqtt://127.0.0.1/'
// MQTT_HOST_USERNAME: ''
// MQTT_HOST_PASSWORD: ''
// MQTT_TOPIC_ROOT: 'unassigned'

// Set values
let edgeNodeId = process.env.MQTT_EDGE_NODE_ID || hostname;
let deviceId = process.env.MQTT_DEVICE_ID || 'AT9999X';
let mqtt_host_ip = process.env.MQTT_HOST_IP || 'mqtt://127.0.0.1/';
let mqtt_username = process.env.MQTT_HOST_USERNAME || '';
let mqtt_password = process.env.MQTT_HOST_PASSWORD || '';
let mqtt_topic_root = (process.env.MQTT_TOPIC_ROOT || 'unassigned') +'/'+edgeNodeId+'/'+deviceId;

// Set up the Intermec Scanner object
const scanner = new IntermecScanner({
    tty: (process.env.TTY || '/dev/ttyACM0'),
    baudrate: 57600,
});

// Set up MQTT client and connect to serve
let mqttClient = mqtt.connect(mqtt_host_ip, {
    username: mqtt_username,
    password: mqtt_password,
    will: {topic: mqtt_topic_root+'/edgeState', payload: 'Offline', retain: true },
});

mqttClient.on('connect', () => {
    console.error('==== MQTT connected ====');
    mqttClient.publish(mqtt_topic_root+'/edgeState', 'Online', { retain: true });
    mqttSendBuffered(); // send any messages buffered locally while MQTT was not connected
});

mqttClient.on('message', (topic, message) => {
    console.log("Subscribed MQTT Message Received: ", topic, message);
});

mqttClient.on('close', () => {
    console.error('==== MQTT closed ====');
});

mqttClient.on('error', (error) => {
    console.error('==== MQTT error ' + error + ' ====');
});

mqttClient.on('offline', () => {
    console.error('==== MQTT offline ====');
});

mqttClient.on('reconnect', () => {
    console.error('==== MQTT reconnect ====');
    mqttClient.publish(mqtt_topic_root+'/edgeState', 'Online', { retain: true });
});

// Set up MQTT publishing
const mqttConfig = {
    error: { topic: mqtt_topic_root+'/comm/error', retain: false, buffer: [],  limit: 100 },
    state: { topic: mqtt_topic_root+'/comm/state', retain: true, buffer: [],  limit: 1 },
    rx: { topic: mqtt_topic_root+'/comm/rx', retain: true, buffer: [],  limit: 20 },
    attribution: { topic: mqtt_topic_root+'/attribution', retain: true, buffer: [],  limit: 20 },
    sampleRequestID: { topic: mqtt_topic_root+'/sampleRequestID', retain: true, buffer: [],  limit: 0 },
    instrumentID: { topic: mqtt_topic_root+'/instrumentID', retain: true, buffer: [],  limit: 0 },
};

function mqttSend(type, message) {
    const messageJSON = JSON.stringify(message);
    if (mqttClient.connected) {
        mqttClient.publish(mqttConfig[type].topic, messageJSON, { retain: mqttConfig[type].retain });
    } else {
        mqttConfig[type].buffer.push(messageJSON)
        while (mqttConfig[type].buffer.length > mqttConfig[type].limit) {
            mqttConfig[type].buffer.shift();
        }
    }
}

// Send the first item in each buffer, then call again in 250 ms if any buffer still not empty
function mqttSendBuffered() {
    let bufferDrained = true;
    if (mqttClient.connected) {
        Object.keys(mqttConfig).forEach(key => {
            let msg = mqttConfig[key].buffer.shift();
            if (msg) mqttClient.publish(mqttConfig[key].topic, msg, { retain: mqttConfig[key].retain });
            if (mqttConfig[key].buffer.length > 0) bufferDrained = false;
        });
        if (!bufferDrained) setTimeout(mqttSendBuffered, 250);
    }
}

let attribution = { gid: 'N/A', uid:'N/A', name: 'N/A' , utc: '1970-01-01T00:00:00.000Z'};

// Publish to appropriate topic when event received from meter
scanner.on('error', (res) => mqttSend('error', res));
scanner.on('state', (res) => mqttSend('state', res));
scanner.on('rx', (res) => {
    mqttSend('rx', res);
    let gidMatch = res.payload.match(/^(\w\-\w+)$/)
    let instrumentIDMatch = res.payload.match(/^CK/)
    let sampleIDMatch = hasJsonStructure(res.payload);
    if (gidMatch) {
        attribution.gid = gidMatch[1];
        attribution.utc = res.utc;
        mqttSend('attribution', attribution);
    } else if (instrumentIDMatch) {
        mqttSend('instrumentID', res);
    } else if (sampleIDMatch && sampleIDMatch.type === 'sample') {
        mqttSend('sampleRequestID', sampleIDMatch);
    }
});

// Start instrument communication
scanner.open();

const r = repl.start('> ');
Object.assign(r.context, {scanner, mqttClient, mqttConfig, attribution});

function hasJsonStructure(str) {
    if (typeof str !== 'string') return false;
    try {
        const result = JSON.parse(str);
        const type = Object.prototype.toString.call(result);
        if (type === '[object Object]' || type === '[object Array]') return result;
    } catch (err) {
        return false;
    }
}