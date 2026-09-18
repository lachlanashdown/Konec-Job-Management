// Browser mirror of src/fields.js — must stay in sync with the server's field list.
const CHECKLIST_FIELDS = [
  { key: 'projectAddress', label: 'Project Address', type: 'text' },
  { key: 'builder', label: 'Builder', type: 'text' },
  { key: 'builderContact', label: 'Builder Contact', type: 'text' },
  { key: 'client', label: 'Client', type: 'text' },
  { key: 'clientContact', label: 'Client Contact', type: 'text' },
  { key: 'wholesaler', label: 'Wholesaler', type: 'text' },
  { key: 'wholesalerContact', label: 'Wholesaler Contact', type: 'text' },
  { key: 'installer', label: 'Installer', type: 'text' },
  { key: 'installerContact', label: 'Installer Contact', type: 'text' },
  {
    key: 'installerType',
    label: 'Installer Type',
    type: 'select',
    options: ['Electrician', 'AC Installer', 'Security Installer', 'Other'],
  },
  { key: 'totalJobCost', label: 'Total Job Cost', type: 'currency' },
  { key: 'commissioning', label: 'Commissioning', type: 'boolean' },
  { key: 'commissioningRate', label: 'Commissioning Rate', type: 'currency' },
];

// From the Konec Commissioning & Handover Sign-Off Form, section 3. Lives per
// Home/Unit — tick-box completion + note + attached photos.
const COMMISSIONING_FIELDS = [
  { key: 'devicesPoweredChecked', label: 'All installed devices powered on and checked' },
  { key: 'devicesAddedToApp', label: 'Devices added to correct app/platform' },
  { key: 'roomsZonesNamed', label: 'Rooms/zones named correctly' },
  { key: 'switchesTestedManually', label: 'Switches tested manually' },
  { key: 'appControlTested', label: 'App control tested' },
  { key: 'automationScenesTested', label: 'Automation/scenes tested' },
  { key: 'smartLocksTested', label: 'Smart locks tested' },
  { key: 'sensorsTested', label: 'Sensors tested' },
  { key: 'blindsCurtainsTested', label: 'Blinds/curtains tested' },
  { key: 'climateAcTested', label: 'Climate/AC controls tested' },
  { key: 'intercomAccessTested', label: 'Intercom/access tested' },
  { key: 'controlPanelTested', label: 'Control panel tested' },
  { key: 'wifiNetworkConfirmed', label: 'Wi-Fi/network connection confirmed' },
  { key: 'firmwareUpdated', label: 'Firmware/software updated where required' },
  { key: 'userAccessSetup', label: 'User access/account setup completed' },
  { key: 'finalWalkthrough', label: 'Final system walkthrough completed' },
];
