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
// ("Commissioning Checklist"). Each item is a straight Yes/No or Yes/No/N/A
// status rather than a free-value field, tracked separately from the
// pre-site-visit checklist above.
const YES_NO = ['Yes', 'No'];
const YES_NO_NA = ['Yes', 'No', 'N/A'];

const COMMISSIONING_FIELDS = [
  { key: 'devicesPoweredChecked', label: 'All installed devices powered on and checked', type: 'select', options: YES_NO },
  { key: 'devicesAddedToApp', label: 'Devices added to correct app/platform', type: 'select', options: YES_NO },
  { key: 'roomsZonesNamed', label: 'Rooms/zones named correctly', type: 'select', options: YES_NO },
  { key: 'switchesTestedManually', label: 'Switches tested manually', type: 'select', options: YES_NO },
  { key: 'appControlTested', label: 'App control tested', type: 'select', options: YES_NO },
  { key: 'automationScenesTested', label: 'Automation/scenes tested', type: 'select', options: YES_NO },
  { key: 'smartLocksTested', label: 'Smart locks tested', type: 'select', options: YES_NO_NA },
  { key: 'sensorsTested', label: 'Sensors tested', type: 'select', options: YES_NO_NA },
  { key: 'blindsCurtainsTested', label: 'Blinds/curtains tested', type: 'select', options: YES_NO_NA },
  { key: 'climateAcTested', label: 'Climate/AC controls tested', type: 'select', options: YES_NO_NA },
  { key: 'intercomAccessTested', label: 'Intercom/access tested', type: 'select', options: YES_NO_NA },
  { key: 'controlPanelTested', label: 'Control panel tested', type: 'select', options: YES_NO_NA },
  { key: 'wifiNetworkConfirmed', label: 'Wi-Fi/network connection confirmed', type: 'select', options: YES_NO },
  { key: 'firmwareUpdated', label: 'Firmware/software updated where required', type: 'select', options: YES_NO_NA },
  { key: 'userAccessSetup', label: 'User access/account setup completed', type: 'select', options: YES_NO },
  { key: 'finalWalkthrough', label: 'Final system walkthrough completed', type: 'select', options: YES_NO },
];

function buildDefaultItems(fields) {
  const items = {};
  for (const field of fields) {
    items[field.key] = {
      value: field.type === 'boolean' ? false : '',
      checked: false,
      note: '',
    };
  }
  return items;
}

function defaultChecklist() {
  return buildDefaultItems(CHECKLIST_FIELDS);
}

function defaultCommissioningChecklist() {
  return buildDefaultItems(COMMISSIONING_FIELDS);
}

module.exports = {
  CHECKLIST_FIELDS,
  COMMISSIONING_FIELDS,
  defaultChecklist,
  defaultCommissioningChecklist,
};
