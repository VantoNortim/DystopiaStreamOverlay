const msgType =  {
    PlayerConnected: "A",
    PlayerChangedTeam: "B",
    PlayerDisconnected: "C",
    PlayerSpawned: "D",
    PlayerMeatChanged: "E",
    PlayerConnectedWithTeam: "F",
    PlayerEnergyChanged: "G",
    PlayerDeckingStatusChanged: "H",
    PlayerDied: "J",
    SpawnTimerChanged: "K",
    ClientConnected: "L",
    TeamNameChanged: "M",
    PeriodicUpdate: "N",
    CyberFrag: "O"
}

const Teams = {
    Spectate: 1,
    Punks: 2,
    Corps: 3
}

const Classes = {
    Unknown: "Unknown",
    Light: "Light",
    Medium: "Medium",
    Heavy: "Heavy"
}

const ClassData = {
    Unknown: {  MaxHP: 1, MaxArmour: 1 },
    Light: { MaxHP: 75, MaxArmour: 50 },
    Medium: { MaxHP: 100, MaxArmour: 100 },
    Heavy: { MaxHP: 140, MaxArmour: 200 }
}

const CyberFragDisplayDuration = 5 * 1000; //Ms

var players = {};

function init() {
    players = {};
    document.querySelector('#team2PlayerContainer').innerHTML = '';
    document.querySelector('#team3PlayerContainer').innerHTML = '';

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

    ws.onclose = (event) => {
        handleError(event.reason);
    }

    ws.onerror = (event) => {
        ws.close();
    }

    function handleError (msg) {
        console.error('Socket interrupted.', msg);
        setTimeout(function() {
            console.info('Reconnecting...')
            init();
        }, 1000);
    }
}

function handleMessage(data) {
    console.log(data);
    var type = data[0];
    var parts = data.slice(1).split(':');
	
	for(var i = 0; i < parts.length; i++){
		if(parts[i].match(/^\d+$/)){
			parts[i] = parseInt(parts[i]);
		}
	}
	
    switch (type) {
        case msgType.ClientConnected:
            console.info('Client connected to server' + parts[0]);
            break;
        case msgType.PlayerConnected:
            //Special case for player names that contain ':'
            var playerId = parts.shift();
            var playerName = parts.join(':');
            connectPlayer(playerId, playerName);
            break;
        case msgType.PlayerConnectedWithTeam:
            //Special case for player names that contain ':'
            var playerId = parts.shift();
            var teamId = parts.shift();
            var playerName = parts.join(':');
            connectPlayer(playerId, playerName);
            changePlayerTeam(playerId, teamId);
            break;
        case msgType.PlayerChangedTeam:
            changePlayerTeam(parts[0], parts[1]);
            break;
        case msgType.PlayerDisconnected:
            disconnectPlayer(parts[0]);
            break;
        case msgType.PlayerSpawned:
            var implants = String(parts[2]).split('');
            var usingScs = implants.length == 14 && implants[0] == "1";
            playerSpawn(parts[0], getPlayerClassFromClassId(parts[1]), usingScs);
            break;
        case msgType.PlayerMeatChanged:
            updatePlayerHealth(parts[0], parts[1]);
            updatePlayerArmor(parts[0], parts[2]);
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
            changeTeamNames(parts[0]);
            break;
        case msgType.PeriodicUpdate:
            updateSpawnTimer(2, parts[0]);
            updateSpawnTimer(3, parts[1]);
            parts.splice(0, 2);
            parts.forEach(element => {
                var pParts = element.split('-');
                periodicUpdate(pParts[0], pParts[1], pParts[2], parts[3]);
            });
            break;
        case msgType.CyberFrag:
            cyberFragPlayer(parts[0]);
            break;
    }
}

function periodicUpdate(id, health, energy, deckingStatus) {
    updatePlayerDeckingStatus(id, deckingStatus != null);
    updatePlayerHealth(id, health);
    updatePlayerEnergy(id, energy);

    var player = getPlayer(id);
    if(player.cyberFragged != null) {
        if(player.cyberFragged + CyberFragDisplayDuration < Date.now()) {
            removeCbyerFragStatus(id);
        }
    }
}

function removeCbyerFragStatus(id) {
    getPlayerChildNode(id, "player-class").classList.remove("cyber-frag");
}

function cyberFragPlayer(id) {
    getPlayerChildNode(id, "player-class").classList.add("cyber-frag");
    var player = getPlayer(id);
    player.cyberFragged = Date.now();
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

    if(player.Team != Teams.Spectate) {
        removePlayerFromTeamOverlay(id)
        player.Class = null;
    }

    player.Team = teamId;

    if(teamId != Teams.Spectate) {
        addPlayerToTeamOverlay(id, player);
        player.Class = Classes.Unknown;
    }

    player.Spawned = false;
}

function addPlayerToTeamOverlay(id, player) {
    var playerTemp = document.getElementById('playerTemplate').cloneNode(true);
    playerTemp.id = 'player' + id
    playerTemp.querySelector('.name').innerText = player.Name;

    document.getElementById('team' + player.Team).appendChild(playerTemp);

    setClassPicture(id);
}

function removePlayerFromTeamOverlay(id) {
    var playerOverlayItem = document.getElementById('player' + id);
    if(playerOverlayItem != null) {
        playerOverlayItem.remove();
    }
}

function disconnectPlayer(id) {
    removePlayerFromTeamOverlay(id);
    players[id] = null;
}

function setClassPicture(id) {
    var player = getPlayer(id);
    var unknownClass = player.Class == Classes.Unknown || player.Class == null;
    setPicture(id, unknownClass ? Classes.Unknown : player.Class, unknownClass ? "" : player.Team); 
}

function setPicture(id, name, team) {
    var imageNode = document.querySelector('#player' + id + ' .player-class');
    var teamPrefix = "";

    switch(team) {
        case 2:
            teamPrefix = "p-";
            break;
        case 3:
            teamPrefix = "c-";
            break;
        default:
            teamPrefix = "";
            break;
    }

    var imagePath = "url('resources/images/" + teamPrefix + name.toLowerCase() + '.png' + "')";
    imageNode.style.backgroundImage = imagePath;
}

function playerSpawn(id, playerClass, usingScs = false) {
    var player = getPlayer(id);
    player.MaxEnergy = 50 + (usingScs ? 25 : 0);
    player.Class = playerClass;

    player.Spawned = true;

    setClassPicture(id);   

    var classData = ClassData[playerClass];
    updatePlayerHealth(id, classData.MaxHP);
    updatePlayerArmor(id, classData.MaxArmour);
    //Do not update energy as it might be 0 from TK

    removeCbyerFragStatus(id);
    getPlayerChildNode(id, "player-class").classList.remove("dead");
}

function getPlayerClassFromClassId(id) {
    switch(id) {
        case 1:
            return Classes.Light;
        case 2:
            return Classes.Medium;
        case 3:
            return Classes.Heavy;
        default:
            return Classes.Unknown;
    }
}

function updatePlayerHealth(id, amount) {
    var player = getPlayer(id);

    if(player.Spawned != true) {
        return;
    }

    if(!player.Decking) {
        updatePlayerHealthText(id, amount);
    }

    var hpBar = getPlayerChildNode(id, 'stats-container .health-bar');
    hpBar.style.width = amount == 0 ? 0 : percentageOf(amount, ClassData[player.Class].MaxHP) + '%';
}

function updatePlayerArmor(id, amount) {
    var player = getPlayer(id);

    if(player.Spawned != true) {
        return;
    }

    var armourBar = getPlayerChildNode(id, 'stats-container .armour-bar');
	
    armourBar.style.width = amount == 0 ? 0 : percentageOf(amount, ClassData[player.Class].MaxArmour) + '%';
}

function updatePlayerEnergy(id, amount) {
    var player = getPlayer(id);

    if(player.Spawned != true) {
        return;
    }

    if(amount > 50) {
        player.MaxEnergy = 75;
    }

    if(player.Decking) {
        updatePlayerHealthText(id, amount);
    }

    var energyBar = getPlayerChildNode(id, 'stats-container .energy-bar');
    energyBar.style.width = percentageOf(amount, player.MaxEnergy) + '%';
}

function updatePlayerHealthText(id, amount) {
    var value = getPlayerChildNode(id, 'stats-container .health-value');
    value.innerText = amount;
}

function updatePlayerDeckingStatus(id, deckedIn) {
    var player = getPlayer(id);
    
    if(player.Decking == deckedIn) {
        return;
    }
    
    player.Decking = deckedIn;

    if(deckedIn) {
        setPicture(id, "cyber", player.Team);
        swapHealthEnergyBars(id, false);
    } else {
        setClassPicture(id);
        swapHealthEnergyBars(id, true);
    }
}

function swapHealthEnergyBars(id, health) {
    var eCont = getPlayerChildNode(id, 'stats-container .energy');
    var hCont = getPlayerChildNode(id, 'stats-container .health');
    if(health) {
        
        eCont.style.top = "auto";
        eCont.style.bottom = "0px";
        eCont.style.height = "20%";

        
        hCont.style.bottom = "auto";
        hCont.style.top = "0px";
        hCont.style.height = "80%";
    } else {
        eCont.style.bottom = "auto";
        eCont.style.top = "0px";
        eCont.style.height = "80%";

        hCont.style.top = "auto";
        hCont.style.bottom = "0px";
        hCont.style.height = "20%";
    }
}

function killPlayer(id) {

    if(getPlayer(id) == null) {
        return;
    }

    updatePlayerHealth(id, 0);
    updatePlayerArmor(id, 0);
    removeCbyerFragStatus(id);
    getPlayerChildNode(id, "player-class").classList.add("dead");
}

function updateSpawnTimer(teamId, time) {
    var timeNode = document.querySelector('#team' + teamId + 'Timer');
    timeNode.innerText = time < 0 ? 0 : time;
}

function changeTeamNames(names) {
    var parts = names.match(/(\"[^\"]+\")/g);

    if(parts.length != 2) {
        return;
    }

    document.querySelector('#team2Name').innerText = parts[0].replaceAll('"', '');
    document.querySelector('#team3Name').innerText = parts[1].replaceAll('"', '');
}

function getPlayerChildNode(id, nodeClass) {
    return document.querySelector('#player' + id + ' .' + nodeClass);
}

function percentageOf(amount, max) {
    return (amount / max) * 100;
}

document.addEventListener('DOMContentLoaded', function (evt) { init(); }, false);