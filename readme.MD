# Camera Preset on Home Screen

## About

This Macro builds a UX with all camera presets that's made available on the touch panel HomeScreen

The UX is in sync to any events related to Camera Presets.

[![Preset List](/images/camPresets-Menu.png)](#)

## Features
- Increases Camera Preset Discovery
- Reduces time to select a preset
- Mirrors Presets Mirrored in Native Preset Menu
- Feedback Synchronized on change
- Automatic UI Generation
- Automatic tracking features (Presenter, Speaker, Frames) discovery and selection [Optional]

## Installation
- Download a copy of the Camera_Presets_On_Homescreen.js macro
- Cloud
  - Login to Webex Control Hub as admin or device admin
  - Navigate to your device
  - Select Macros
  - Upload Camera_Presets_On_Homescreen.js and select save
- Local
  - Log into the Device Web UI
  - Navigate to the Macro Editor
  - Import Macro from File and select Camera_Presets_On_Homescreen.js
  - Save and Activate the Macro

## Configuration
 At top level of the Macro is a Configuration Object defined as ```config```

 ```config``` contains a JSON Object Literal which allows you to modify the experience

Below is a copy of that configuration object, alter the values to best suite your use case

 ```javascript
const config = {
  /** Governs ```Features``` specific to this Macro
   */
  Features: {
    /** Show Speakertrack, Frames and Presentertrack as selectable options in the Camera Preset menu if available
     * @type {boolean}
     * @defaultValue false
     */
    ShowTrackingOptions: true,
    /** Activate the Default Camera Preset (if available) when a call connects
     * @type {boolean}
     * @defaultValue true
     */
    OnCallSetDefaultPreset: true,
    /** Waits for the camera to make a full stop before setting the main source
     * @type {boolean}
     * @defaultValue true
     */
    MainSourceSetOnCameraRampStop: true //In Milliseconds 0 - 5000
  },
  /** Governs ```UI``` elements, such as panel name, color, text etc
   */
  UserInterface: {
    /**
     * Change characteristics of the Panel
     */
    Panel: {
      Properties: {
        Color: '#1170CF',
        Order: 1,
        Location: 'HomeScreenAndCallControls',
        Icon: 'Camera'
      },
      /**
       * Change Text elements associated to the Panel
       */
      Text: {
        Name: 'Camera Presets',
        Page: {
          Name: 'Camera Preset List',
          Infobox: 'Select a Camera Preset from the list below',
          CameraTracking: {
            Modes: {
              Presenter: 'Presenter 🔀',
              Speaker: 'Speaker 🔀',
              Frames: 'Frames 🔀',
              Manual: 'Manual 🔧'
            }
          },
          Preset: {
            DefaultIndicator: '✪'
          },
          ManualPrompt: {
            Title: 'Manual Camera Control',
            Text: 'To position the Camera Manually, open the Native Camera Control Menu and select Manual',
            Dismiss: 'Dismiss'
          }
        }
      }
    }
  }
};
 ```