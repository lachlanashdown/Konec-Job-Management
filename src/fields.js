// Shared definition of the fixed checklist fields.
// type: 'text' | 'currency' | 'boolean' | 'select' (select requires an 'options' array)
// Loaded by the server (CommonJS) — mirrored in public/js/fields.js for the browser.
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

// From the Konec Commissioning & Handover Sign-Off Form, section 3
// ("Commissioning Checklist"). Lives per Home/Unit now (a project can have
// multiple homes, each commissioned separately) — plain tick-box completion
// plus a note and any attached photos, rather than a Yes/No/N/A dropdown.
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

function defaultChecklist() {
  const items = {};
  for (const field of CHECKLIST_FIELDS) {
    items[field.key] = {
      value: field.type === 'boolean' ? false : '',
      checked: false,
      note: '',
    };
  }
  return items;
}

// Per-Home commissioning checklist: tick-box + note + attached photos.
function defaultHomeCommissioningChecklist() {
  const items = {};
  for (const field of COMMISSIONING_FIELDS) {
    items[field.key] = { checked: false, note: '', photos: [] };
  }
  return items;
}

module.exports = {
  CHECKLIST_FIELDS,
  COMMISSIONING_FIELDS,
  defaultChecklist,
  defaultHomeCommissioningChecklist,
};
