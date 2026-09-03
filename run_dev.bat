@echo off
title Ejecutando Translate G en Modo Desarrollo (Tauri + Rust)
echo =======================================================
echo   Iniciando Translate G en Modo Desarrollo
echo =======================================================
echo.

:: Cerrar instancias previas para evitar conflictos de bloqueo de archivos (os error 5)
taskkill /F /IM translate-g.exe >nul 2>&1

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

echo [INFO] Iniciando el entorno de desarrollo de Tauri...
echo [INFO] Esto iniciara el servidor local de sincronizacion (puerto 3001)
echo [INFO] y abrira la ventana de Translate G.
echo [INFO] Puedes editar archivos frontend o backend y se recargara automaticamente.
echo.

call npm run tauri dev

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Hubo un error al ejecutar la aplicacion.
    pause
)
