#pragma semicolon 1
#include <sourcemod>
#include <sdktools>
#include <sdkhooks>
#include <websocket>

#define PLUGIN_VERSION "1.0.1"

#define MAX_CLIENTS 32

new WebsocketHandle:g_hListenSocket = INVALID_WEBSOCKET_HANDLE;
new Handle:g_hChildren;
new Handle:g_hChildIP;

#define DYS_OVERLAY_DEBUG false

#define TEAM_PUNKS 2
#define TEAM_CORPS 3

static int g_iTeams[4] = { -1, -1, -1, -1 };

static char teamNames[100] = "\"Punks\" \"Corps\"";

static char configFileName[] = "dys_overlay.cfg";

static KeyValues config;

public Plugin:myinfo =
{
	name = "Dystopia Overlay",
	author = "You're Pissed Off",
	description = "Dystopia overlay plugin. Based on Agiel's Neotokyo Websockets",
	version = PLUGIN_VERSION,
	url = "github.com/VantoNortim/DystopiaStreamOverlay"
}

public OnPluginStart()
{
	g_hChildren = CreateArray();
	g_hChildIP = CreateArray(ByteCountToCells(33));

	HookEvent("player_team", Event_OnPlayerTeam);
	HookEvent("player_death", Event_OnPlayerDeath);
	HookEvent("player_spawn", Event_OnPlayerSpawn);
	HookEvent("player_class", Event_OnPlayerClass);
	HookEvent("player_hurt", Event_OnPlayerHurt);

	RegAdminCmd("sm_stn", UpdateTeamNames, ADMFLAG_KICK, "Change overlay team names");

	// Hook again if plugin is restarted
	for(int client = 1; client <= MaxClients; client++)
	{
		if(IsValidClient(client))
		{
			OnClientPutInServer(client);
		}
	}

	config = GetConfigKvp();

	float updateRate = config.GetFloat("updaterate", 1.0);

	CreateTimer(updateRate, Event_TimerTick, _, TIMER_REPEAT);
}

KeyValues GetConfigKvp()
{
	char path[PLATFORM_MAX_PATH];
	if (BuildPath(Path_SM, path, sizeof(path), "configs/%s", configFileName) <= 0)
	{
		ThrowError("Failed to build path");
	}
	else if (!FileExists(path))
	{
		ThrowError("Config file doesn't exist: \"%s\"", path);
	}

	KeyValues kv = new KeyValues("cfg_overlay");
	if (!kv.ImportFromFile(path))
	{
		delete kv;
		ThrowError("Failed to import cfg to keyvalues: \"%s\"", path);
	}

	return kv;
}

public OnAllPluginsLoaded()
{
	int port = config.GetNum("port");

	decl String:sServerIP[40];
	new longip = GetConVarInt(FindConVar("hostip")), pieces[4];
	pieces[0] = (longip >> 24) & 0x000000FF;
	pieces[1] = (longip >> 16) & 0x000000FF;
	pieces[2] = (longip >> 8) & 0x000000FF;
	pieces[3] = longip & 0x000000FF;
	FormatEx(sServerIP, sizeof(sServerIP), "%d.%d.%d.%d", pieces[0], pieces[1], pieces[2], pieces[3]);
	if(g_hListenSocket == INVALID_WEBSOCKET_HANDLE)
		g_hListenSocket = Websocket_Open(sServerIP, port, OnWebsocketIncoming, OnWebsocketMasterError, OnWebsocketMasterClose);
	PrintToServer("Overlay Websocket Address: %s:%d", sServerIP, port);
}

public OnPluginEnd()
{
	if(g_hListenSocket != INVALID_WEBSOCKET_HANDLE)
		Websocket_Close(g_hListenSocket);
}

public void OnMapStart() {

	int iEnt = -1;
	int iTeam = 0;
	while ( (iEnt = FindEntityByClassname( iEnt, "dys_team" )) != -1 ) {
		iTeam = GetEntProp( iEnt, Prop_Data, "m_Team" );
		switch ( iTeam ) {
			case TEAM_PUNKS, TEAM_CORPS: {
				g_iTeams[iTeam] = iEnt;
			}
		}
	}
}

public Action UpdateTeamNames(int client, int args) {
	char argStr[100];
	GetCmdArgString(argStr, sizeof(argStr));
	strcopy(teamNames, sizeof(teamNames), argStr);
	SendTeamNames();

	return Plugin_Handled;
}

void SendTeamNames() {
	decl String:sBuffer[102];
	Format(sBuffer, sizeof(sBuffer), "M%s", teamNames);

	SendToAllChildren(sBuffer);
}

public bool:IsAnyClientConnectedToOverlay() {
    new iSize = GetArraySize(g_hChildren);
    return iSize != 0;
}

public bool:OnClientConnect(client, String:rejectmsg[], maxlen)
{
	if(IsFakeClient(client))
		return true;

	decl String:sIP[33], String:sSocketIP[33];
	GetClientIP(client, sIP, sizeof(sIP));
	new iSize = GetArraySize(g_hChildIP);
	for(new i=0;i<iSize;i++)
	{
		GetArrayString(g_hChildIP, i, sSocketIP, sizeof(sSocketIP));
		if(StrEqual(sIP, sSocketIP))
		{
			Websocket_UnhookChild(WebsocketHandle:GetArrayCell(g_hChildren, i));
			RemoveFromArray(g_hChildIP, i);
			RemoveFromArray(g_hChildren, i);
			if(iSize == 1)
				break;
			i--;
			iSize--;
		}
	}

	return true;
}

public OnClientPutInServer(client)
{
	decl String:sBuffer[128];
	GetClientAuthId(client, AuthId_SteamID64, sBuffer, sizeof(sBuffer));
	Format(sBuffer, sizeof(sBuffer), "A%d:%N", GetClientUserId(client), client);

	SendToAllChildren(sBuffer);
}

public Event_OnPlayerTeam(Handle:event, const String:name[], bool:dontBroadcast)
{
	new userid = GetEventInt(event, "userid");
	new team = GetEventInt(event, "team");

	if(team == 0)
		return;

	decl String:sBuffer[10];
	Format(sBuffer, sizeof(sBuffer), "B%d:%d", userid, team);

	SendToAllChildren(sBuffer);
}

public OnClientDisconnect(client)
{
	if(IsClientInGame(client))
	{
		new iSize = GetArraySize(g_hChildren);
		if(iSize == 0)
			return;

		decl String:sBuffer[20];
		Format(sBuffer, sizeof(sBuffer), "C%d", GetClientUserId(client));

		SendToAllChildren(sBuffer);
	}
}

public Event_OnPlayerSpawn(Handle:event, const String:name[], bool:dontBroadcast)
{
	int userid = GetEventInt(event, "userid");
	int client = GetClientOfUserId(userid);
	
	if(!IsPlayerAlive(client)) {
		return;
	}

	if (GetClientTeam(client) < 2)
		return;

	CreateTimer(0.1, SendDelayedSpawnMessage, userid);
}

public Event_OnPlayerClass(Handle:event, const String:name[], bool:dontBroadcast)
{
	int userid = GetEventInt(event, "userid");
	int client = GetClientOfUserId(userid);
	
	if(!IsPlayerAlive(client)) {
		return;
	}

	if (GetClientTeam(client) < 2)
		return;

	CreateTimer(0.1, SendDelayedSpawnMessage, userid);
}

public Action SendDelayedSpawnMessage(Handle timer, int userid) {
	int client = GetClientOfUserId(userid);

	if(client == 0)  {
		return Plugin_Continue;
	}		

	int class = GetEntProp(client, Prop_Send, "m_iClass");
	int implants = GetEntProp(client, Prop_Send, "m_iImplants");

	decl String:sBuffer[84];
	Format(sBuffer, sizeof(sBuffer), "D%d:%d:%b", userid, class, implants);

	SendToAllChildren(sBuffer);
	return Plugin_Continue;
}

public Event_OnPlayerDeath(Handle:event, const String:name[], bool:dontBroadcast)
{
	new victim = GetEventInt(event, "userid");

	new String:sBuffer[20];
	Format(sBuffer, sizeof(sBuffer), "J%d", victim);

	SendToAllChildren(sBuffer);
}

public Event_OnPlayerHurt(Handle:event, const String:name[], bool:dontBroadcast)
{
	new userid = GetEventInt(event, "userid");
	int client = GetClientOfUserId(userid);

	int armor = GetEntProp(client, Prop_Send, "m_ArmorValue");
	decl String:sBuffer[20];
	Format(sBuffer, sizeof(sBuffer), "E%d:%d:%d", userid, GetEventInt(event, "health"), armor);

	SendToAllChildren(sBuffer);
}

public Action Event_TimerTick(Handle timer) {

	if(!IsAnyClientConnectedToOverlay()) {
		return Plugin_Continue;
	}

	float spawnTimeTeam2 = GetEntPropFloat( g_iTeams[TEAM_PUNKS], Prop_Send, "m_fSpawnTime" ) - GetGameTime();
	float spawnTimeTeam3 = GetEntPropFloat( g_iTeams[TEAM_CORPS], Prop_Send, "m_fSpawnTime" ) - GetGameTime();

	decl String:sBuffer[512];
	Format(sBuffer, sizeof(sBuffer), "N%d:%d", RoundFloat(spawnTimeTeam2), RoundFloat(spawnTimeTeam3));
	
	for(new i=1;i<=MaxClients;i++)
	{
		if(IsClientInGame(i) && IsPlayerAlive(i))
		{
			int userId = GetClientUserId(i);
			int client = GetClientOfUserId(userId);
			int health = GetEntProp(client, Prop_Send, "m_iHealth");
			float energy = GetEntPropFloat(client, Prop_Send, "m_fEnergy");
			int isInCyber = GetEntProp(client, Prop_Send, "m_bIsCyberSpace");
			new String:tBuffer[20]; 

			if(isInCyber == 1) {
				Format(tBuffer, sizeof(tBuffer), ":%d-%d-%d-%d", userId, health, RoundFloat(energy), isInCyber);
			} else {
				Format(tBuffer, sizeof(tBuffer), ":%d-%d-%d", userId, health, RoundFloat(energy));
			}

			StrCat(sBuffer, 512, tBuffer);
		}
	}

	SendToAllChildren(sBuffer);
	return Plugin_Continue;
}

public Action:OnWebsocketIncoming(WebsocketHandle:websocket, WebsocketHandle:newWebsocket, String:remoteIP[], remotePort, String:protocols[256], char getPath[2000])
{
	PrintToServer("Overlay client connected! Someone is watching...");

	// Make sure there's no ghosting! (Does not work :())
	/*decl String:sIP[33];
	for(new i=1;i<=MaxClients;i++)
	{
		if(IsClientInGame(i) && !IsFakeClient(i))
		{
			GetClientIP(i, sIP, sizeof(sIP));
			//decl String:sBuffer[2300];
			//Format(sBuffer, sizeof(sBuffer), "IP %s Remote IP %s (%d) %s", sIP, remoteIP, strlen(remoteIP), getPath);
			//PrintToServer(sBuffer);
			if(StrEqual(sIP, remoteIP))
				return Plugin_Stop;
		}
	}*/

	Websocket_HookChild(newWebsocket, OnWebsocketReceive, OnWebsocketDisconnect, OnChildWebsocketError);
	Websocket_HookReadyStateChange(newWebsocket, OnWebsocketReadyStateChanged);
	PushArrayCell(g_hChildren, newWebsocket);
	PushArrayString(g_hChildIP, remoteIP);
	return Plugin_Continue;
}

public OnWebsocketReadyStateChanged(WebsocketHandle:websocket, WebsocketReadyState:readystate)
{
	new iIndex = FindValueInArray(g_hChildren, websocket);
	if(iIndex == -1)
		return;

	if(readystate != State_Open)
		return;

	decl String:sBuffer[128];
	Websocket_Send(websocket, SendType_Text, " Hello?");

	SendTeamNames();

	// Add all players to it's list
	for(new i=1;i<=MaxClients;i++)
	{
		if(IsClientInGame(i))
		{
			int userId = GetClientUserId(i);
			int client = GetClientOfUserId(userId);
			GetClientAuthId(i, AuthId_SteamID64, sBuffer, sizeof(sBuffer));

			Format(sBuffer, sizeof(sBuffer), "F%d:%d:%N", userId, GetClientTeam(i), i);

			Websocket_Send(websocket, SendType_Text, sBuffer);

			if(IsPlayerAlive(i)) {
				int class = GetEntProp(client, Prop_Send, "m_iClass");
				int implants = GetEntProp(client, Prop_Send, "m_iImplants");
				Format(sBuffer, sizeof(sBuffer), "D%d:%d:%b", userId, class, implants);
				Websocket_Send(websocket, SendType_Text, sBuffer);
			}
		}
	}

	return;
}

public OnWebsocketMasterError(WebsocketHandle:websocket, const errorType, const errorNum)
{
	LogError("MASTER SOCKET ERROR: handle: %d type: %d, errno: %d", _:websocket, errorType, errorNum);
	g_hListenSocket = INVALID_WEBSOCKET_HANDLE;
}

public OnWebsocketMasterClose(WebsocketHandle:websocket)
{
	g_hListenSocket = INVALID_WEBSOCKET_HANDLE;
}

public OnChildWebsocketError(WebsocketHandle:websocket, const errorType, const errorNum)
{
	LogError("CHILD SOCKET ERROR: handle: %d, type: %d, errno: %d", _:websocket, errorType, errorNum);
	new iIndex = FindValueInArray(g_hChildren, websocket);
	RemoveFromArray(g_hChildren, iIndex);
	RemoveFromArray(g_hChildIP, iIndex);
}

public OnWebsocketDisconnect(WebsocketHandle:websocket)
{
	new iIndex = FindValueInArray(g_hChildren, websocket);
	RemoveFromArray(g_hChildren, iIndex);
	RemoveFromArray(g_hChildIP, iIndex);

	PrintToServer("Overlay client disconnected!");
}

public SendToAllChildren(const String:sData[])
{
#if DYS_OVERLAY_DEBUG
	PrintToServer("SendToAllChildren: %s", sData);
#endif

	if(!IsAnyClientConnectedToOverlay()) {
		return;
	}

	new iSize = GetArraySize(g_hChildren);
	new WebsocketHandle:hHandle;
	for(new i=0;i<iSize;i++)
	{
		hHandle = WebsocketHandle:GetArrayCell(g_hChildren, i);
		if(Websocket_GetReadyState(hHandle) == State_Open)
			Websocket_Send(hHandle, SendType_Text, sData);
	}
}

stock UTF8_Encode(const String:sText[], String:sReturn[], const maxlen)
{
	new iStrLenI = strlen(sText);
	new iStrLen = 0;
	for(new i=0;i<iStrLenI;i++)
	{
		iStrLen += GetCharBytes(sText[i]);
	}

	decl String:sBuffer[iStrLen+1];

	new i = 0;
	for(new w=0;w<iStrLenI;w++)
	{
		if(sText[w] < 0x80)
		{
			sBuffer[i++] = sText[w];
		}
		else if(sText[w] < 0x800)
		{
			sBuffer[i++] = 0xC0 | sText[w] >> 6;
			sBuffer[i++] = 0x80 | sText[w] & 0x3F;
		}
		else if(sText[w] < 0x10000)
		{
			sBuffer[i++] = 0xE0 | sText[w] >> 12;
			sBuffer[i++] = 0x80 | sText[w] >> 6 & 0x3F;
			sBuffer[i++] = 0x80 | sText[w] & 0x3F;
		}
	}
	sBuffer[i] = '\0';
	strcopy(sReturn, maxlen, sBuffer);
}

public OnWebsocketReceive(WebsocketHandle:websocket, WebsocketSendType:iType, const String:receiveData[], const dataSize)
{
	return;
	/*if(iType != SendType_Text)
		return;

	decl String:sBuffer[dataSize+4];
	Format(sBuffer, dataSize+4, "Z%s", receiveData);

	new iSize = GetArraySize(g_hChildren);
	new WebsocketHandle:hHandle;
	for(new i=0;i<iSize;i++)
	{
		hHandle = WebsocketHandle:GetArrayCell(g_hChildren, i);
		if(hHandle != websocket && Websocket_GetReadyState(hHandle) == State_Open)
			Websocket_Send(hHandle, SendType_Text, sBuffer);
	}*/
}

bool:IsValidClient(client) 
{
    if ( !( 1 <= client <= MaxClients ) || !IsClientInGame(client) ) 
        return false; 
     
    return true; 
} 