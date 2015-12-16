
jspbt.js: state.js command.js reader.js player.js
	java -jar ~/Downloads/compiler.jar --js=state.js --js=reader.js --js=command.js --js=player.js --language_in=ES6_STRICT --language_out=ES5_STRICT >| jspbt.js
