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

function defaultChecklist() {
  const checklist = {};
  for (const field of CHECKLIST_FIELDS) {
    checklist[field.key] = {
      value: field.type === 'boolean' ? false : '',
      checked: false,
      note: '',
    };
  }
  return checklist;
}

module.exports = { CHECKLIST_FIELDS, defaultChecklist };
