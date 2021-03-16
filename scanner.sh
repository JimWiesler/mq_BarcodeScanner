# screen -X -S "pH" stuff $'\003' - Need to find a way to kill a running scren session

# Environment variables
export TTY='/dev/ttyACM0'

export MQTT_TOPIC_ROOT="Instruments/Kinsale"
export MQTT_EDGE_NODE_ID="TEST003"
export MQTT_DEVICE_ID="SCAN9999X"
export MQTT_HOST_IP="mqtt://192.168.1.110/"
export MQTT_HOST_USERNAME=""
export MQTT_HOST_PASSWORD=""

# Launch in a screen session
cd ~/edge/scanner
screen -d -m -S scanner npm start
