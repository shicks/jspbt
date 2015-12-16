
jspbt.js: state.js command.js reader.js player.js Makefile
	{ java -jar ~/Downloads/compiler.jar --js=state.js --js=reader.js --js=command.js --js=player.js --language_in=ES6_STRICT --language_out=ES5_STRICT --create_source_map=jspbt.srcmap; echo "//# sourceMappingURL=jspbt.srcmap"; } >| jspbt.js
