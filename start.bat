@echo off
start http://localhost:3000
rem Rakentaa pelin dist-kansioon ja rakentaa uudelleen aina kun tiedostot muuttuvat.
cd /d %~dp0
call npm run watch
pause
