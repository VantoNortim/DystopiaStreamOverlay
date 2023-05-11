
// [Notes]
// Problem if player or team name contains a colon, must be escaped (server-side?) then unescaped in handleMessage()
// Values received as "messages" are typically stored as strings but checked as ints. Added stuff to parse all numbers into ints, but may not be reliable in cases where, for example, a player name is only numbers.


function test_createTeam(teamID){
	console.log("=== Creating test team " + teamID + " ===");
	
	test_sendMessage("M", ["Nades Without Number", "Epic Team 2"]); // Connect
	
	for(var i = 1; i <= 5; i++){
		var id = (i + ((teamID - 1) * 5));
		var name = "Player: " + id;
		
		test_sendMessage("A", [id, name]); // Connect
		test_sendMessage("B", [id, teamID]); // Join team
		test_sendMessage("D", [id, i % 3, 100]); // Spawn
		if(i % 2 == 0) test_sendMessage("G", [id, 50]); // Energy
		var armour = ((i + 1) % 2 == 0) ? 3 : 5;
		var health = (i % 2 == 0) ? 3 : 5;
		test_sendMessage("E", [id, health, armour]); // Armour and Health
	}
}

function test_sendMessage(type, parts){
	handleMessage(type + parts.join(":"));
}

function test_setBackground(){
	var numBackgrounds = 5;
	var mainView = document.getElementById("mainView");
	mainView.style.backgroundImage = "url(test/bg-" + (Math.floor(Math.random() * numBackgrounds) + 1) + ".jpg)";
	mainView.style.backgroundRepeat = "no-repeat";
	mainView.style.backgroundSize = "cover";
	mainView.style.backgroundPosition = "center";
}

document.addEventListener("DOMContentLoaded", function(){
	test_setBackground();
	
	test_createTeam(2);
	test_createTeam(3);

	document.getElementById("team2Timer").innerText = "45";
	document.getElementById("team3Timer").innerText = "45";
});
