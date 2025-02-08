@echo off
mode con: cols=129 lines=50
cls
title A1 EVO Neuron 'odd.wtf' program shortcuts
color 9E
:MENU
cls
mode con: cols=120 lines=30
for /f "tokens=*" %%i in ('odd.wtf -v') do set "version=%%i" 2>nul
if not defined version (
    echo ERROR: Unable to determine odd.wtf version.
    echo Ensure it is installed and included in the PATH.
    pause
    exit /b
)
mode con: cols=129 lines=50
echo program version: %version%
echo.
echo =================================================================================================================================
echo                                            'odd.wtf' Tools (list is not comprehensive)
echo =================================================================================================================================
echo.
echo  1. Generate '.avr' configuration file for use with 'A1 Evo Neuron'
echo    - generates and saves a .avr file from your current system configuration for use as input for Neuron.
echo  2. Transfer '.oca' optimized calibration file to your receiver
echo    - uploads the most recently saved '.oca' calibration file in the folder to your receiver.
echo  3. Optimize your receiver settings for manual REW measurements
echo    - configures your AVR to manually take your own measurements of your system speakers and subs with the 'Room EQ Wizard'.
echo  4. Run built-in subwoofer volume leveling procedure
echo    - starts the automatic volume leveling procedure for subwoofer(s) using the built-in tool
echo  5. Start built-in automated measurement process (suitable for systems with a single subwoofer connection)
echo    - starts automated measurements and generates an .ady data file from which Neuron can extract all measurements
echo  6. Start built-in measurement process for systems with 'multiple subwoofers' [EXPERIMENTAL]
echo    - enables 'directional bass' mode and produces measurements including individual measurements for each of your subs
echo    - tested to work even when 'directional bass' mode is unsupported by your receiver but may not work with ALL receiver models!
echo  7. Open 'command prompt' to use additional options or other features of 'odd.wtf' tool
echo    - opens command prompt to use additional odd.wtf tools or add custom options to the features listed above
echo  8. Exit this menu
echo.
echo =================================================================================================================================
echo.
set /p option=">> Select an 'odd.wtf' option (1-8)"
:: Handle menu options with case-insensitive comparison
set "option=%option:~0,1%"
if /i "%option%"=="1" goto OPTION1
if /i "%option%"=="2" goto OPTION2
if /i "%option%"=="3" goto OPTION3
if /i "%option%"=="4" goto OPTION4
if /i "%option%"=="5" goto OPTION5
if /i "%option%"=="6" goto OPTION6
if /i "%option%"=="7" goto OPEN_CMD
if /i "%option%"=="8" goto EXIT_PROGRAM
:: Invalid input handling
echo.
echo Invalid choice, please try again.
echo.
pause
goto MENU
:: Option 1: Generate .avr Configuration File for A1 Evo Neuron
:OPTION1
cls
echo ===============================================================
echo     Generate '.avr' Configuration File for A1 Evo Neuron
echo ===============================================================
echo.
mode con: cols=120 lines=30
cd /d "%~dp0"
odd.wtf gen -h
odd.wtf gen
if errorlevel 1 (
    echo ERROR: Failed to generate .avr file.
    echo Ensure odd.wtf is functioning correctly.
    echo.
    pause
    goto MENU
)
mode con: cols=129 lines=50
echo .avr file successfully generated for A1 input!
echo.
pause
goto MENU
:: Option 2: Transfer .oca Calibration File to AVR
:OPTION2
cls
echo ===============================================================
echo          Transfer '.oca' Calibration File to AVR
echo ===============================================================
echo.
mode con: cols=120 lines=30
odd.wtf load -h
echo.
echo Searching for the latest .oca file in the current directory...
cd /d "%~dp0"
set "fileName="
FOR /F "eol=| delims=" %%I IN ('DIR "*.oca" /A-D /B /O-D /TW 2^>nul') DO (
    SET "fileName=%%I"
    GOTO FoundFile
)
:: If no .oca file is found
echo No .oca file found in the current directory.
echo.
pause
goto MENU
:FoundFile
echo Found file: %fileName%
echo.
odd.wtf load "%fileName%"
if errorlevel 1 (
    echo ERROR: Failed to load %fileName%.
    echo Ensure odd.wtf is functioning correctly.
    echo.
    pause
    goto MENU
)
mode con: cols=129 lines=50
echo Calibration successfully transferred to AVR!
echo.
pause
goto MENU
:: Option 3: Set AVR to REW Measurement Mode
:OPTION3
cls
echo ===============================================================
echo            Set Your Receiver to 'REW Measurement' Mode
echo ===============================================================
echo.
mode con: cols=120 lines=30
cd /d "%~dp0"
odd.wtf rewmeasure -h
odd.wtf rewmeasure
if errorlevel 1 (
    echo ERROR: Failed to set AVR to REW measurement mode.
    echo Ensure odd.wtf is functioning correctly.
    echo.
    pause
    goto MENU
)
mode con: cols=129 lines=50
echo AVR is now in REW measurement mode!
echo.
pause
goto MENU
:: Option 5: Run Built-in Measurements to Produce .ady File
:OPTION5
cls
echo ===============================================================
echo    Start Built-in Automated Measurement Process (Single Subwoofer)
echo            and Produce '.ady' File
echo ===============================================================
echo.
mode con: cols=120 lines=30
cd /d "%~dp0"
odd.wtf measure -h
odd.wtf measure
if errorlevel 1 (
    echo ERROR: Failed to start measurement process.
    echo Ensure odd.wtf is functioning correctly.
    echo.
    pause
    goto MENU
)
mode con: cols=129 lines=50
echo Measurement process started!
echo.
pause
goto MENU
:: Option 4: Run Built-in Subwoofer Leveling
:OPTION4
cls
echo ===============================================================
echo           Run Built-in Subwoofer Leveling Procedure
echo ===============================================================
echo.
mode con: cols=120 lines=30
cd /d "%~dp0"
odd.wtf swlevel -h
odd.wtf swlevel
if errorlevel 1 (
    echo ERROR: Failed to start subwoofer leveling.
    echo Ensure odd.wtf is functioning correctly.
    echo.
    pause
    goto MENU
)
mode con: cols=129 lines=50
echo Subwoofer leveling process started!
echo.
pause
goto MENU
:: Option 6: Experimental - Measurement Process for Multiple Subs
:OPTION6
cls
echo ===============================================================
echo    Start Built-in Measurement Process for Multiple Subs (Experimental) [EXPERIMENTAL]
echo ===============================================================
echo.
mode con: cols=120 lines=30
cd /d "%~dp0"
odd.wtf measure -h
odd.wtf measure -b
if errorlevel 1 (
    echo ERROR: Failed to start experimental measurement process.
    echo Ensure odd.wtf is functioning correctly.
    echo.
    pause
    goto MENU
)
mode con: cols=129 lines=50
echo Directional bass mode measurement process started!
echo.
pause
goto MENU
:: Option 7: Exit Program
:EXIT_PROGRAM
cls
echo ===============================================================
echo                 Exiting the Application
echo ===============================================================
echo Thank you for using 'odd.wtf' tool. Goodbye!
echo.
pause
exit
:: Option 8: Open Command Prompt and Display 'odd.wtf -h'
:OPEN_CMD
cls
echo ===============================================================
echo          Open Command Prompt and Display 'odd.wtf -h'
echo ===============================================================
echo.
mode con: cols=120 lines=30
cd /d "%~dp0"
start cmd.exe /k "odd.wtf -h"
goto MENU
