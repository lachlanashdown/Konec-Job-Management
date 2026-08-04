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
