# DystopiaStreamOverlay
Spectator stream overlay client and server plugin for Dystopia.
# Installation
## Prereqs
Your server must be running Sourcemod with the Websockets plugin installed.
## Config
Either build the plugin on your server (recommended) or put the built smx file in your Sourcemod plugins folder.
Copy the config .cfg file into \addons\sourcemod\configs then change the port to whatever is desired. This port needs to be open otherwise the client will not be able to connect
## Running the client
Download the overlay folder and open the Index.html in your prefered browser. Then add a query string in the address bar with the following parameters: "?ip=<ip>:<port>" so it should look like "index.html?ip=192.168.1.1:6222".
 Now your client should be connected to the server.
