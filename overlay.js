const msgType =  {
    PlayerConnected: "A",
    PlayerChangedTeam: "B",
    PlayerDisconnected: "C",
    PlayerSpawned: "D",
    PlayerHealthChanged: "E",
    PlayerArmorChanged: "F",
    PlayerEnergyChanged: "G",
    PlayerDeckingStatusChanged: "H",
    PlayerDied: "J",
    SpawnTimerChanged: "K",
    ClientConnected: "L",
    TeamNameChanged: "M"
}

const Teams = {
    Spectate: 0,
    Punks: 1,
    Corps: 2
}

//Might not need
const Classes = {
    Unknown: "Unknown",
    Light: "Light",
    Medium: "Medium",
    Heavy: "Heavy"
}

//Maybe not needed?
const ClassData = {
    Light: { MaxHP: 5, MaxArmour: 5 },
    Medium: { MaxHP: 10, MaxArmour: 10 },
    Heavy: { MaxHP: 15, MaxArmour: 15 }
}

var players = {};

function init() {
    var urlParams = new URLSearchParams(window.location.search);
    var ip = urlParams.get('ip');

    if(ip == null || ip.length < 1) {
        console.error("No IP found, not connecting to any websocket!");
        return;
    }

    const ws = new WebSocket('ws://' + ip);
    ws.onmessage = (event) => {
        handleMessage(event.data);
    }
}

function handleMessage(data) {
    var type = data[0];
    var parts = data.slice(1).split(':');

    switch (type) {
        case msgType.ClientConnected:
            console.info('Client connected to server' + parts[0]);
            break;
        case msgType.PlayerConnected:
            connectPlayer(parts[0], parts[1])
            break;
        case msgType.PlayerChangedTeam:
            changePlayerTeam(parts[0], parts[1]);
            break;
        case msgType.PlayerDisconnected:
            disconnectPlayer(parts[0]);
            break;
        case msgType.PlayerSpawned:
            playerSpawn(parts[0], getPlayerClassFromClassId(parts[1]), parts[2]);
            break;
        case msgType.PlayerHealthChanged:
            updatePlayerHealth(parts[0], parts[1]);
            break;
        case msgType.PlayerArmorChanged:
            updatePlayerArmor(parts[0], parts[1]);
            break;
        case msgType.PlayerEnergyChanged:
            updatePlayerEnergy(parts[0], parts[1]);
            break;
        case msgType.PlayerDeckingStatusChanged:
            updatePlayerDeckingStatus(parts[0], parts[1]);
            break;
        case msgType.PlayerDied:
            killPlayer(parts[0]);
            break;
        case msgType.SpawnTimerChanged:
            updateSpawnTimer(parts[0], parts[1]);
            break;
        case msgType.ClientConnected:
            console.info("Connected successfully: " + parts[0]);
            break;
        case msgType.TeamNameChanged:
            changeTeamNames(parts[0], parts[1]);
            break;
    }
}

function getPlayer(id) {
    return players[id];
}

function connectPlayer(id, name) {
    console.info('Player ' + name +' connected {' + id + '}');
    players[id] = { Name: name };
}

function changePlayerTeam(id, teamId) {
    var player = getPlayer(id);

    if(player == null) {
        console.error("No player found for team change.");
        return;
    }

    console.log('Player ' + player.Name + ' joined team ' + teamId);

    if(player.Team == 1 || player.Team == 2) {
        removePlayerFromTeamOverlay(id)
    }

    player.Team = teamId;

    addPlayerToTeamOverlay(id, player);
}

function addPlayerToTeamOverlay(id, player) {
    var playerTemp = document.getElementById('playerTemplate').cloneNode(true);
    playerTemp.id = 'player' + id
    playerTemp.querySelector('.name').innerText = player.Name;

    document.getElementById('team' + player.Team).appendChild(playerTemp);

    setClassPicture(id, Classes.Unknown);
}

function removePlayerFromTeamOverlay(id) {
    var playerOverlayItem = document.getElementById(id);
    if(playerOverlayItem != null) {
        playerOverlayItem.remove();
    }
}

function disconnectPlayer(id) {
    removePlayerFromTeamOverlay(id);
    players[id] = null;
}

function setClassPicture(id, playerClass) {
    var imageNode = document.querySelector('#player' + id + ' .player-class');
    var player = getPlayer(id);
    var teamPrefix = "";

    if(playerClass != Classes.Unknown) {
        switch(player.Team) {
            case 1:
                teamPrefix = "p-";
                break;
            case 2:
                teamPrefix = "c-";
                break;
        }
    }

    var imagePath = "url('" + teamPrefix + playerClass.toLowerCase() + '.png' + "')";
    imageNode.style.backgroundImage = imagePath;
}

function playerSpawn(id, playerClass, maxEnergy) {
    var player = getPlayer(id);
    player.MaxEnergy = maxEnergy;
    player.Class = playerClass;

    setClassPicture(id, playerClass);

    var classData = ClassData[playerClass];
    updatePlayerHealth(id, classData.MaxHP);
    updatePlayerArmor(id, classData.MaxArmour);
    //Do not update energy as it might be 0 from TK
}

function getPlayerClassFromClassId(id) {
    switch(id) {
        case 0:
            return Classes.Light;
        case 1:
            return Classes.Medium;
        case 2:
            return Classes.Heavy;
    }
}

function updatePlayerHealth(id, amount) {
    var value = getPlayerChildNode(id, 'health-container .value');
    var hpBar = getPlayerChildNode(id, 'health-container .health');
    var player = getPlayer(id);

    value.innerText = amount;
    hpBar.style.width = percentageOf(amount, ClassData[player.Class].MaxHP) + '%';
}

function updatePlayerArmor(id, amount) {
    var armourBar = getPlayerChildNode(id, 'health-container .armour');
    var player = getPlayer(id);

    armourBar.style.width = percentageOf(amount, ClassData[player.Class].MaxArmour) + '%';
}

function updatePlayerEnergy(id, amount) {
    var value = getPlayerChildNode(id, 'energy-container .value');
    var energyBar = getPlayerChildNode(id, 'energy-container .bar');
    var player = getPlayer(id);
    
    value.innerText = amount;
    energyBar.style.width = percentageOf(amount, player.MaxEnergy) + '%';
}

function updatePlayerDeckingStatus(id, deckedIn) {
    //TODO: Do something here to show player is decked in or not
}

function killPlayer(id) {
    updatePlayerHealth(id, 0);
    updatePlayerArmor(id, 0);
    //TODO: Some effect to show player is dead
}

function updateSpawnTimer(teamId, time) {
    var timeNode = document.querySelector('#team' + teamId + 'Timer');
    timeNode.innerText = time;
}

function changeTeamNames(team1Name, team2Name) {
    document.querySelector('#team1Name').innerText = team1Name;
    document.querySelector('#team2Name').innerText = team2Name;
}

function getPlayerChildNode(id, nodeClass) {
    return document.querySelector('#player' + id + ' .' + nodeClass);
}

function percentageOf(amount, max) {
    return (amount / max) * 100;
}

document.addEventListener('DOMContentLoaded', function (evt) { init(); }, false);