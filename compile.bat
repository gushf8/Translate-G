@echo off
title Compilador de Translate G Windows (Tauri + Rust)
echo =======================================================
echo   Compilando Translate G para Windows PC
echo =======================================================
echo.

:: Verificar si existe node_modules, si no, instalar dependencias
if not exist "node_modules\" (
    echo [INFO] No se encontro node_modules. Instalando dependencias de Node...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Error al instalar dependencias de Node.
        pause
        exit /b %errorlevel%
    )
)

echo [INFO] Iniciando compilacion de produccion con Tauri...
echo [INFO] Esto compilara el backend en Rust y empaquetara la interfaz web.
echo [INFO] La primera vez puede tardar unos minutos descargando y compilando crates de Rust.
echo.

:: Cerrar instancias activas de Translate G para evitar bloqueo de archivos
taskkill /f /im translate-g.exe >nul 2>&1

:: Crear carpeta Instaladores si no existe en la raiz
if not exist "Instaladores\" mkdir "Instaladores"

:: Limpiar instaladores previos
del /q "Instaladores\*.*" >nul 2>&1

:: Ejecutar compilación de Tauri
call npm run tauri build

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Hubo un error durante la compilacion del proyecto.
    echo [INFO] Por favor, asegurese de tener instalado el Build Tools de Visual Studio con soporte de C++.
    pause
    exit /b %errorlevel%
)

:: Copiar el instalador MSI y el instalador EXE (NSIS) a la carpeta Instaladores en la raiz
copy /y "src-tauri\target\release\bundle\msi\*.msi" "Instaladores\" >nul 2>&1
copy /y "src-tauri\target\release\bundle\nsis\*.exe" "Instaladores\" >nul 2>&1

:: Eliminar los ejecutables sueltos generados en la carpeta target/release
del /f /q "src-tauri\target\release\translate-g.exe" >nul 2>&1
del /f /q "src-tauri\target\release\deps\translate_g.exe" >nul 2>&1

echo.
echo =======================================================
echo   ¡Compilacion Completa con Exito!
echo =======================================================
echo.
echo Los instaladores se han copiado a la carpeta:
echo   Instaladores\
echo.
echo Archivos creados:
dir /b "Instaladores\"
echo.
pause
