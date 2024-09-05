/********************************************************
Copyright (c) 2024 Cisco and/or its affiliates.
This software is licensed to you under the terms of the Cisco Sample
Code License, Version 1.1 (the "License"). You may obtain a copy of the
License at
               https://developer.cisco.com/docs/licenses
All use of the material herein must be in accordance with the terms of
the License. All rights not expressly granted by the License are
reserved. Unless required by applicable law or agreed to separately in
writing, software distributed under the License is distributed on an "AS
IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
or implied.
*********************************************************

 * Author(s):               Robert(Bobby) McGonigle Jr
 *                          Technical Marketing Engineering, Technical Leader
 *                          Cisco Systems
 * 
 * Consulting Engineer(s)   Christopher Hess
 *                          Customer Delivery Architect
 *                          Cisco Systems
 * 
 * Description:
 *   - Re-maps Camera Presets to be accessible under a Custom UI Extension
 * 
 * Version: 1-0-2
*/

import xapi from 'xapi';

/** The ```config``` object defines optional customizable fields for this macro
 * 
 * Adjust the values below to best suite your use case
 */
const config = {
  /** Governs ```Features``` specific to this Macro
   */
  Features: {
    /** Show Speakertrack, Frames and Presentertrack as selectable options in the Camera Preset menu if available
     * @type {boolean}
     * @defaultValue false
     */
    ShowTrackingOptions: false,
    /** Activate the Default Camera Preset (if available) when a call connects
     * @type {boolean}
     * @defaultValue true
     */
    OnCallSetDefaultPreset: true,
    /** Waits for the camera to make a full stop before setting the main source
     * @type {boolean}
     * @defaultValue true
     */
    MainSourceSetOnCameraRampStop: true
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

/** The version of this Macro
 * 
 * Only used in logging
 * 
 * @see init
 */
const version = `1-0-2`

/** List of available Camera Presets
 * 
 * This list updates each time the UI is built
 * 
 * @see buildUserInterface();
 */
let availableCameraTrackingFeatures = [];


/** List of available Camera Tracking Features
 * 
 * This list updates each time the UI is built
 * 
 * @see buildUserInterface();
 */
let availableCameraPresets = [];

/** Sets the time for the failsafe debounce timer
 * 
 * @see monitorCameraStoppedPosition
 */
let failsafeDebounceTime_for_MainSourceSetOnCameraRampStop = 2500;

/** Enables a bypass on camera positioning events
 * 
 * Helps determine when a camera is being manually moved vs programmatically via Presets
 * 
 * @see presetPositioningBypassHandler
 */
let presetPositioningBypass = false;

/** Object to set the presetPositioningBypass timeout into
 * 
 * @see presetPositioningBypass
 */
let presetPositioningBypassHandler = '';


/** Stores the last know preset selection in the UI
 */
let lastPresetSelection = '';

/** Parse string into JSON Object Literal
 * 
 * @param {string} data
 * 
 * data must be formatted as ```Key:Value~```
 * 
 * ```~``` acts as a separator for Key Value Pairs
 * 
 * ```:``` acts as a separator for Keys and Values
 * 
 * 
 */
function parseKeyValuePairs(data) {
  const regex = /(?:([^~:]+):([^~:]+))(?:~|$)+/g;

  if (!regex.test(data)) {
    console.error(`Unable to parse data key value pair [${data}] || Malformed String`);
    return { "Type": 'Error' };
  };

  let response = {};
  const keyValuePairs = data.split(`~`);

  keyValuePairs.forEach(element => {
    const [key, value] = element.split(':');
    response[key] = isNaN(value) ? value : Number(value);
  });

  return response;
};


/**
 * Prints error to console, with optional Context and Type parameters
 * 
 * @param {object} e
 * The original error to be handled
 * 
 * @param {string} context
 * Details to better eplain the error
 * 
 * @param {string} type
 * define the logging type. Defaults to ```error``` if not defined
 */
function handleError(error, context, type = 'error') {
  let err = { Context: context, ...error }
  let confirmType = 'error';
  switch (type.toLowerCase()) {
    case 'log': case 'warn': case 'debug': case 'info': case 'warn':
      confirmType = type.toLowerCase();
      break;
  }
  console[confirmType](err)
}

/** Activates camera preset and set's main source to CameraId
 * 
 * @param {object} presetInfo
 * 
 * presetInfo must include a minimum definition of a CameraId and PresetId as Keys. Name is optional and helps with logging
 * 
 * @xapi [xCommand Camera Preset Activate](https://roomos.cisco.com/xapi/Command.Camera.Preset.Activate/)
 * @xapi [xCommand Video Input SetMainVideoSource](https://roomos.cisco.com/xapi/Command.Video.Input.SetMainVideoSource/)
 * @xapi [xCommand Cameras SpeakerTrack Deactivate](https://roomos.cisco.com/xapi/Command.Cameras.SpeakerTrack.Deactivate/)
 * @xapi [xCommand Cameras SpeakerTrack Frames Deactivate](https://roomos.cisco.com/xapi/Command.Cameras.SpeakerTrack.Frames.Deactivate/)
 * @xapi [xCommand Cameras PresenterTrack Set](https://roomos.cisco.com/xapi/Command.Cameras.PresenterTrack.Set/)
 */
async function activateCameraPreset(presetInfo, cause) {
  clearTimeout(presetPositioningBypassHandler);
  presetPositioningBypass = true;
  await xapi.Command.Cameras.SpeakerTrack.Deactivate().catch(e => handleError(e, `Failed to Deactivate Speakertrack. Cause: ${cause}`, 'debug'));
  await xapi.Command.Cameras.SpeakerTrack.Frames.Deactivate().catch(e => handleError(e, `Failed to Deactivate Frames. Cause: ${cause}`, 'debug'));
  await xapi.Command.Cameras.PresenterTrack.Set({ Mode: 'Off' }).catch(e => handleError(e, `Failed to Deactivate Presentertrack. Cause: ${cause}`, 'debug'));

  if (presetInfo.CameraId == undefined || presetInfo.PresetId == undefined) {

    throw Error({ message: `Unable to set Camera Preset`, Cause: cause });
  };

  console.debug({ Debug: `Setting Preset`, ...presetInfo, Cause: cause })
  xapi.Command.Camera.Preset.Activate({ PresetId: presetInfo.PresetId });

  if (config.Features.MainSourceSetOnCameraRampStop) {
    console.debug({ Debug: `Waiting for Camera Position to Set` })
    await monitorCameraStoppedPosition(presetInfo.CameraId).then(resolution => {
      console.debug({ Debug: `Camera Position Monitoring Stopped on [[${presetInfo.CameraId}]]`, Resolution: resolution })
    });
  }

  console.debug({ Debug: `Setting MainSource to [${presetInfo.CameraId}] for Camera Preset` })
  await xapi.Command.Video.Input.SetMainVideoSource({ ConnectorId: presetInfo.CameraId });

  console.log({ Message: `Camera Preset Activated`, PresetInfo: presetInfo, Cause: cause });

  presetPositioningBypassHandler = setTimeout(() => {
    presetPositioningBypass = false;
  }, failsafeDebounceTime_for_MainSourceSetOnCameraRampStop + 500)
};

/** Temporarily subscribes to Pan, Tilt and Zoom information of a given CameraId
 * 
 * Will resolve based on 1 of 2 debounce methods. The failsafe debounce will fire within 2.5 seconds of running this function to ensure it complete. The generic debounce will fire once all PTZ movement concludes
 * 
 * This will resolve when either debounce timer complete
 * 
 * @param {number} cameraId
 * The Camera you want to subscribe to for it's movement status
 * 
 * @async
 * 
 * @xapi [xStatus Cameras Camera[n] Position](https://roomos.cisco.com/xapi/search?Type=Status&search=Status+Camera+*+Position)
 */
async function monitorCameraStoppedPosition(cameraId) {
  let failsafeDebounce = {
    run: '',
    length: failsafeDebounceTime_for_MainSourceSetOnCameraRampStop
  }
  let debounce = {
    run: '',
    length: 250
  }

  return new Promise(resolve => {
    failsafeDebounce.run = setTimeout(() => {
      clearTimeout(debounce.run);
      resolve(`Monitor Timed Out`);
    }, failsafeDebounce.length)

    let cameraPositionSubsription = xapi.Status.Cameras.Camera[cameraId].Position.on(({ Pan, Tilt, Zoom }) => {
      if ((!Pan && !Tilt) && !Zoom) {
        return;
      };

      clearTimeout(debounce.run);

      debounce.run = setTimeout(() => {
        clearTimeout(failsafeDebounce.run);
        cameraPositionSubsription();
        cameraPositionSubsription = () => void 0;

        resolve(`Camera [${cameraId}] Stopped`);
      }, debounce.length);
    });
  });
};

/** Activates the default camera preset and set's main source to CameraId
 * 
 * @xapi [xCommand Camera Preset List](https://roomos.cisco.com/xapi/Command.Camera.Preset.List/)
 * @xapi [xCommand Camera Preset Activate](https://roomos.cisco.com/xapi/Command.Camera.Preset.Activate/)
 * @xapi [xCommand Video Input SetMainVideoSource](https://roomos.cisco.com/xapi/Command.Video.Input.SetMainVideoSource/)
 * @xapi [xCommand Cameras SpeakerTrack Deactivate](https://roomos.cisco.com/xapi/Command.Cameras.SpeakerTrack.Deactivate/)
 * @xapi [xCommand Cameras SpeakerTrack Frames Deactivate](https://roomos.cisco.com/xapi/Command.Cameras.SpeakerTrack.Frames.Deactivate/)
 * @xapi [xCommand Cameras PresenterTrack Set](https://roomos.cisco.com/xapi/Command.Cameras.PresenterTrack.Set/)
 */
async function activateDefaultCameraPreset(cause) {
  clearTimeout(presetPositioningBypassHandler);
  presetPositioningBypass = true;

  await xapi.Command.Cameras.SpeakerTrack.Deactivate().catch(e => handleError(e, `Failed to Deactivate Speakertrack. Cause: ${cause}`, 'debug'));
  await xapi.Command.Cameras.SpeakerTrack.Frames.Deactivate().catch(e => handleError(e, `Failed to Deactivate Frames. Cause: ${cause}`, 'debug'));
  await xapi.Command.Cameras.PresenterTrack.Set({ Mode: 'Off' }).catch(e => handleError(e, `Failed to Deactivate Presentertrack. Cause: ${cause}`, 'debug'));

  availableCameraPresets = (await xapi.Command.Camera.Preset.List()).Preset;

  let defaultFound = false;

  for (let i = 0; i < availableCameraPresets.length; i++) {
    if (availableCameraPresets[i].DefaultPosition.toLowerCase() == 'true') {
      defaultFound = true;
      console.debug({ Debug: `Default Camera Preset Found, setting preset position` })
      await xapi.Command.Camera.Preset.Activate({ PresetId: availableCameraPresets[i].PresetId });

      if (config.Features.MainSourceSetOnCameraRampStop) {
        console.debug({ Debug: `Waiting for Camera Position to Set` })
        await monitorCameraStoppedPosition(availableCameraPresets[i].CameraId).then(resolution => {
          console.debug({ Debug: `Camera Position Monitoring Stopped on [${availableCameraPresets[i].CameraId}]`, Resolution: resolution })
        });
      }

      console.debug({ Debug: `Setting MainSource to [${availableCameraPresets[i].CameraId}] for Default Camera Preset` })
      await xapi.Command.Video.Input.SetMainVideoSource({ ConnectorId: availableCameraPresets[i].CameraId });

      console.log({ Message: `Default Camera Preset Activated`, PresetInfo: availableCameraPresets[i], Cause: cause });
      break;
    };
  };

  if (!defaultFound) {
    console.warn({ Warn: `Unable to find Default Camera Preset`, Cause: cause });
  };

  presetPositioningBypassHandler = setTimeout(() => {
    presetPositioningBypass = false;
  }, failsafeDebounceTime_for_MainSourceSetOnCameraRampStop + 100)
};

/** Assembles the Camera Preset UserInterface Extension Panel and Widgets
 * 
 * @see availableCameraPresets;
 * @see availableCameraTrackingFeatures;
 * @xapi [xCommand UserInterface Extensions Panel Save](https://roomos.cisco.com/xapi/Command.UserInterface.Extensions.Panel.Save/)
 * @xapi [xCommand Camera Preset List](https://roomos.cisco.com/xapi/Command.Camera.Preset.List/)
 * @xapi [xStatus Cameras SpeakerTrack Availability](https://roomos.cisco.com/xapi/Status.Cameras.SpeakerTrack.Availability/)
 * @xapi [xStatus Cameras SpeakerTrack Frames Availability](https://roomos.cisco.com/xapi/Status.Cameras.SpeakerTrack.Frames.Availability/)
 * @xapi [xStatus Cameras PresenterTrack Availability](https://roomos.cisco.com/xapi/Status.Cameras.PresenterTrack.Availability/)
 */
const buildUserInterface = async function (cause) {
  console.info({ Info: `Building Camera Preset Panel`, Cause: cause })
  const panelId = 'camPresets';

  availableCameraPresets = (await xapi.Command.Camera.Preset.List()).Preset;

  const hasSpeakertrack = (await xapi.Status.Cameras.SpeakerTrack.Availability.get()) == 'Available' ? true : false;
  const hasFrames = (await xapi.Status.Cameras.SpeakerTrack.Frames.Availability.get()) == 'Available' ? true : false;
  const hasPresenterTrack = (await xapi.Status.Cameras.PresenterTrack.Availability.get()) == 'Available' ? true : false;

  let presetGroupButtonXML = `<Value>
      <Key>Type:Automatic~Feature:Manual</Key>
      <Name>${config.UserInterface.Panel.Text.Page.CameraTracking.Modes.Manual}</Name>
    </Value>`;

  let presetRowXml = ``;

  if (config.Features.ShowTrackingOptions) {
    if (hasSpeakertrack) {
      availableCameraTrackingFeatures.push('Speaker');
      presetGroupButtonXML = presetGroupButtonXML + `<Value>
      <Key>Type:Automatic~Feature:Speaker</Key>
      <Name>${config.UserInterface.Panel.Text.Page.CameraTracking.Modes.Speaker}</Name>
    </Value>`
    }

    if (hasFrames) {
      availableCameraTrackingFeatures.push('Frames');
      presetGroupButtonXML = presetGroupButtonXML + `<Value>
      <Key>Type:Automatic~Feature:Frames</Key>
      <Name>${config.UserInterface.Panel.Text.Page.CameraTracking.Modes.Frames}</Name>
    </Value>`
    }

    if (hasPresenterTrack) {
      availableCameraTrackingFeatures.push('Presenter');
      presetGroupButtonXML = presetGroupButtonXML + `<Value>
      <Key>Type:Automatic~Feature:Presenter</Key>
      <Name>${config.UserInterface.Panel.Text.Page.CameraTracking.Modes.Presenter}</Name>
    </Value>`
    }

    availableCameraTrackingFeatures = availableCameraTrackingFeatures.filter((item, index) => availableCameraTrackingFeatures.indexOf(item) === index)

    if (availableCameraTrackingFeatures.length > 0) {

      console.debug({ Debug: `Tracking features [${availableCameraTrackingFeatures}] identified and will render in the Camera Presets Menu` });
    } else {
      console.warn({ Warn: `Unable to render Tracking UI. config.Features.ShowTrackingOptions is set to true but no tracking features are available. Please check your camera config and cameras for compatibility` });
    }
  }

  availableCameraPresets.forEach(preset => {
    presetGroupButtonXML = presetGroupButtonXML + `<Value>
      <Key>Type:Preset~CameraId:${preset.CameraId}~PresetId:${preset.PresetId}~PresetName:${preset.Name}</Key>
      <Name>${preset.Name}${preset.DefaultPosition.toLowerCase() == 'true' ? ` ${config.UserInterface.Panel.Text.Page.Preset.DefaultIndicator}` : ''}</Name>
    </Value>`
  })

  const availableSelections = availableCameraPresets.length + availableCameraTrackingFeatures.length

  if (availableSelections > 1) {
    presetRowXml = `<Row>
        <Name>Select Preset</Name>
        <Widget>
          <WidgetId>camPresets~PresetList~Presets</WidgetId>
          <Type>GroupButton</Type>
          <Options>size=4;columns=1</Options>
          <ValueSpace>
            ${presetGroupButtonXML}
          </ValueSpace>
        </Widget>
      </Row>`

  } //else if (availableSelections == 1) {
  else {
    presetRowXml = `<Row>
          <Name>Select Preset</Name>
            <Widget>
              <WidgetId>camPresets~PresetList~Presets</WidgetId>
              <Name>No Camera Presets found, create a few using the Native Camera Menu and they will populate here</Name>
              <Type>Text</Type>
              <Options>size=4;fontSize=normal;align=center</Options>
            </Widget>
        </Row>`
  }

  const panelXml = `<Extensions>
  <Panel>
    <Order>${config.UserInterface.Panel.Properties.Order}</Order>
    <Origin>local</Origin>
    <Location>${config.UserInterface.Panel.Properties.Location}</Location>
    <Icon>${config.UserInterface.Panel.Properties.Icon}</Icon>
    <Color>#${config.UserInterface.Panel.Properties.Color.replaceAll('#', '')}</Color>
    <Name>${config.UserInterface.Panel.Text.Name}</Name>
    <ActivityType>Custom</ActivityType>
    <Page>
      <Name>Preset List</Name>
      <Row>
        <Name>Info</Name>
        <Widget>
          <WidgetId>camPresets~PresetList~Info</WidgetId>
          <Name>${config.UserInterface.Panel.Text.Page.Infobox}</Name>
          <Type>Text</Type>
          <Options>size=4;fontSize=normal;align=center</Options>
        </Widget>
      </Row>
      ${presetRowXml}
      <PageId>camPresets~PresetList</PageId>
      <Options>hideRowNames=1</Options>
    </Page>
  </Panel>
</Extensions>`

  await xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: panelId }, panelXml);
}

/** Iterates over the Subscribe Object to start subscriptions defined within it
 * 
 * @see Subscribe
 */
async function StartSubscriptions() {
  const subs = Object.getOwnPropertyNames(Subscribe);
  subs.sort();
  let mySubscriptions = [];
  subs.forEach(element => {
    Subscribe[element]();
    mySubscriptions.push(element);
    Subscribe[element] = function () {
      console.warn({ Warn: `The [${element}] subscription is already active, unable to fire it again` });
    };
  });
  console.log({ Message: 'Subscriptions Set', Details: { Total_Subs: subs.length, Active_Subs: mySubscriptions.join(', ') } });
};


/** Defines all Event/Status/Config subscriptions needed for this macro
 *  
 * @xapi [xEvent UserInterface Extensions Widget Action](https://roomos.cisco.com/xapi/Event.UserInterface.Extensions.Widget.Action/)
 * @xapi [xEvent CameraPresetActivated](https://roomos.cisco.com/xapi/Event.CameraPresetActivated/)
 * @xapi [xEvent CameraPresetListUpdated](https://roomos.cisco.com/xapi/Event.CameraPresetListUpdated/)
 * @xapi [xStatus Cameras Camera[n] Position](https://roomos.cisco.com/xapi/search?Type=Status&search=Status+Camera+*+Position)
 * @xapi [xConfiguration](https://roomos.cisco.com/xapi/search?search=Configuration+*&Type=Configuration)
 * 
* - - -
 * 
 * The following may be subscribed too during initialization
 * @see init
 * 
 * @xapi [xStatus Call](https://roomos.cisco.com/xapi/search?search=Status+Call+*&Type=Status)
 * @xapi [xStatus Cameras PresenterTrack Status](https://roomos.cisco.com/xapi/Status.Cameras.PresenterTrack.Status/)
 * @xapi [xStatus Cameras SpeakerTrack Status](https://roomos.cisco.com/xapi/Status.Cameras.SpeakerTrack.Status/)
 * @xapi [xStatus Cameras SpeakerTrack Frames Status](https://roomos.cisco.com/xapi/Status.Cameras.SpeakerTrack.Frames.Status/)
 */
const Subscribe = {
  WidgetAction: function () {
    xapi.Event.UserInterface.Extensions.Widget.Action.on(async ({ WidgetId, Type, Value }) => {
      if (Type == 'released' && WidgetId == 'camPresets~PresetList~Presets') {
        const data = parseKeyValuePairs(Value);
        if (!Value.includes('Manual')) {
          lastPresetSelection = data;
        }
        switch (data.Type) {
          case 'Automatic':
            clearTimeout(presetPositioningBypassHandler);
            presetPositioningBypass = true;
            if (data.Feature != 'Manual') {
              console.log({ Message: `Activating [${data.Feature}] tracking` })
            }
            try {
              switch (data.Feature) {
                case 'Presenter':
                  await xapi.Command.Cameras.PresenterTrack.Set({ Mode: 'Follow' });
                  await xapi.Command.Cameras.SpeakerTrack.Deactivate();
                  await xapi.Command.Cameras.SpeakerTrack.Frames.Deactivate();
                  break;
                case 'Speaker':
                  await xapi.Command.Cameras.PresenterTrack.Set({ Mode: 'Off' });
                  await xapi.Command.Cameras.SpeakerTrack.Activate();
                  await xapi.Command.Cameras.SpeakerTrack.Frames.Deactivate();
                  break;
                case 'Frames':
                  await xapi.Command.Cameras.PresenterTrack.Set({ Mode: 'Off' });
                  await xapi.Command.Cameras.SpeakerTrack.Activate();
                  await xapi.Command.Cameras.SpeakerTrack.Frames.Activate();
                  break;
                case 'Manual':
                  let params = config.UserInterface.Panel.Text.Page.ManualPrompt
                  params['Option.1'] = config.UserInterface.Panel.Text.Page.ManualPrompt.Dismiss;
                  params['Duration'] = 10;
                  delete params.Dismiss;
                  xapi.Command.UserInterface.Message.Prompt.Display(params);
                  console.log({ Message: `Manual Selection detected, prompting user on Manual Control` })
                  let value = ``;
                  switch (lastPresetSelection.Type) {
                    case 'Automatic':
                      value = `Type:Automatic~Feature:${lastPresetSelection.Feature}`
                      break;
                    case 'Preset':
                      value = `Type:Preset~CameraId:${lastPresetSelection.CameraId}~PresetId:${lastPresetSelection.PresetId}~PresetName:${lastPresetSelection.PresetName}`
                      break;
                  }
                  xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: `camPresets~PresetList~Presets`, Value: value }).catch(e => {
                    xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId: `camPresets~PresetList~Presets` })
                    handleError(e, `Failed to Set Widget Value. Cause: WidgetAction>data.Feature Manual`, 'debug')
                  });
                  break;
              }
            } catch (e) {
              xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId: `camPresets~PresetList~Presets` })
              handleError(e, `Failed to activate [${data.Feature}] tracking`);
            }
            presetPositioningBypassHandler = setTimeout(() => {
              presetPositioningBypass = false;
            }, failsafeDebounceTime_for_MainSourceSetOnCameraRampStop + 100)
            break;
          case 'Preset':
            await activateCameraPreset(data);
            break;
          case 'Error':
            break;
        }
      }
    });
  },
  CameraPresetActivated: function () {
    xapi.Event.CameraPresetActivated.on(async ({ PresetId, CameraId }) => {
      clearTimeout(presetPositioningBypassHandler);
      presetPositioningBypass = true;
      const presetInfo = await xapi.Command.Camera.Preset.Show({ PresetId: PresetId });
      xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: `camPresets~PresetList~Presets`, Value: `Type:Preset~CameraId:${CameraId}~PresetId:${PresetId}~PresetName:${presetInfo.Name}` }).catch(e => handleError(e, 'Failed to Set Preset Widget Value on External Preset Selection', 'debug'));
      presetPositioningBypassHandler = setTimeout(() => {
        presetPositioningBypass = false;
      }, failsafeDebounceTime_for_MainSourceSetOnCameraRampStop + 500)
    });
  },
  CameraPresetListUpdated: function () {
    xapi.Event.CameraPresetListUpdated.on(() => {
      buildUserInterface('Camera Preset List Updated');
    })
  },
  CameraPosition: function () {
    xapi.Status.Cameras.Camera['*'].Position.on(({ Pan, Tilt, Zoom }) => {
      if (!presetPositioningBypass) {
        if ((Pan || Tilt) || Zoom) {
          lastPresetSelection = { "Type": "Automatic", "Feature": "Manual" };
          xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: `camPresets~PresetList~Presets`, Value: `Type:Automatic~Feature:Manual` }).catch(e => {
            xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId: 'camPresets~PresetList~Presets' })
            handleError(e, `Failed to Set Widget Value. Cause: CameraPosition change`)
          });
        }
      }
    })
  },
  AllConfigurations: function () {
    xapi.Config.on(async () => await buildUserInterface(`Config Change Detected`));
  }
}

/** Prepares the Codec and various parts of the Macro on script start
 * 
 * @see buildUserInterface
 * @see StartsSubscriptions
 * @see Subscribe
 * 
 * @xapi [xCommand UserInterface Extensions Widget UnsetValue](https://roomos.cisco.com/xapi/Command.UserInterface.Extensions.Widget.UnsetValue/)
 * @xapi [xCommand UserInterface Extensions Widget SetValue](https://roomos.cisco.com/xapi/Command.UserInterface.Extensions.Widget.SetValue/)
 * 
 * - - -
 * 
 The following may be subscribed too during initialization
 * 
 * @xapi [xStatus Call](https://roomos.cisco.com/xapi/search?search=Status+Call+*&Type=Status)
 * @xapi [xStatus Cameras PresenterTrack Status](https://roomos.cisco.com/xapi/Status.Cameras.PresenterTrack.Status/)
 * @xapi [xStatus Cameras SpeakerTrack Status](https://roomos.cisco.com/xapi/Status.Cameras.SpeakerTrack.Status/)
 * @xapi [xStatus Cameras SpeakerTrack Frames Status](https://roomos.cisco.com/xapi/Status.Cameras.SpeakerTrack.Frames.Status/)
 */
const init = async function () {
  console.info({ Info: `Initializing Macro [${_main_macro_name()}] version [${version}]...` });
  await buildUserInterface('Macro Initialization');

  xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId: `camPresets~PresetList~Presets` });

  //Subscribe to Call Status OnCallSetDefaultPreset is true
  if (config.Features.OnCallSetDefaultPreset) {
    Subscribe['CallConnected'] = function () {
      xapi.Status.Call.on(({ Status }) => {
        if (!Status) {
          return;
        };
        switch (Status) {
          case 'Connected': case 'Connecting':
            activateDefaultCameraPreset(`Call [${Status}]`);
            break;
        }
      })
    }
  }

  if (availableCameraTrackingFeatures.length > 0) {
    availableCameraTrackingFeatures.forEach(element => {
      switch (element) {
        case 'Presenter':
          Subscribe['CamerasPresenterTrackStatus'] = function () {
            xapi.Status.Cameras.PresenterTrack.Status.on(event => {
              if (event.toLowerCase() == 'follow') {
                clearTimeout(presetPositioningBypassHandler);
                presetPositioningBypass = true;
                xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: `camPresets~PresetList~Presets`, Value: `Type:Automatic~Feature:${element}` }).catch(e => handleError(e, `Failed to Set Widget Value. Cause: PresenterTrack.Status Subscription`, 'debug'));
                presetPositioningBypassHandler = setTimeout(() => {
                  presetPositioningBypass = false;
                }, failsafeDebounceTime_for_MainSourceSetOnCameraRampStop + 500)
              }
            });
          }
          break;
        case 'Speaker':
          Subscribe['CamerasSpeakerTrackStatus'] = function () {
            xapi.Status.Cameras.SpeakerTrack.Status.on(event => {
              if (event.toLowerCase() == 'active') {
                clearTimeout(presetPositioningBypassHandler);
                presetPositioningBypass = true;
                xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: `camPresets~PresetList~Presets`, Value: `Type:Automatic~Feature:${element}` }).catch(e => handleError(e, `Failed to Set Widget Value. Cause: SpeakerTrack.Status Subscription`, 'debug'));
                presetPositioningBypassHandler = setTimeout(() => {
                  presetPositioningBypass = false;
                }, failsafeDebounceTime_for_MainSourceSetOnCameraRampStop + 500)
              }
            });
          }
          break;
        case 'Frames':
          Subscribe['CamerasSpeakerTrackFramesStatus'] = function () {
            xapi.Status.Cameras.SpeakerTrack.Frames.Status.on(event => {
              if (event.toLowerCase() == 'active') {
                clearTimeout(presetPositioningBypassHandler);
                presetPositioningBypass = true;
                xapi.Command.UserInterface.Extensions.Widget.SetValue({ WidgetId: `camPresets~PresetList~Presets`, Value: `Type:Automatic~Feature:${element}` }).catch(e => handleError(e, `Failed to Set Widget Value. Cause: SpeakerTrack.Frames.Status Subscription`, 'debug'));
                presetPositioningBypassHandler = setTimeout(() => {
                  presetPositioningBypass = false;
                }, failsafeDebounceTime_for_MainSourceSetOnCameraRampStop + 500)
              }
            });
          }
          break;
      }
    })
  }

  await StartSubscriptions();

  console.info({ Info: `Macro Initialized!` });
}

init();