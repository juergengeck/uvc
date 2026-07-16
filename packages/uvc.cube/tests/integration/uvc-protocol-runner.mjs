import {QARunner} from '@refinio/qa.core/dist/QARunner.js';
import Bonjour from 'bonjour-service';
import fs from 'node:fs/promises';
import path from 'node:path';
import {UVC_RECIPES} from '@refinio/uvc.core';

const scanMs = Number(process.env.UVC_QA_SCAN_MS ?? 5000);
const expectedKinds = (process.env.UVC_QA_EXPECTED_KINDS ?? 'cube,expo,groov,esp32')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const services = await browse(scanMs);
const runner = new QARunner();
const esp32FirmwareRoot = path.resolve(
  process.env.UVC_ESP32_FIRMWARE_ROOT
    ?? '../../../vger/packages/esp32.core/firmware/esp32-quicvc-project',
);
const esp32Firmware = await readEsp32FirmwareContract(esp32FirmwareRoot);

for (const platform of ['browser', 'expo', 'cube']) {
  runner.registerPlatform(platform, {
    discovery: ['listPhoneBook'],
    control: ['readLight', 'setLight'],
    journal: ['listDeviceEvents'],
    identity: ['headlessProvisioning'],
  });
}

runner.registerProbe({
  id: 'mdns-identity-contract',
  title: 'Every UVC advertisement is bound to a ONE identity',
  run: () => {
    const identityServices = services.filter(service => service.serviceType === 'one-refinio');
    const invalid = identityServices.filter(service => !(
      /^[0-9a-f]{64}$/i.test(service.txt.deviceId ?? '')
      && /^[0-9a-f]{64}$/i.test(service.txt.pubkey ?? '')
      && /^[0-9a-f]{64}$/i.test(service.txt.personId ?? '')
      && service.txt.platform === 'one'
    ));
    return {
      status: invalid.length === 0 ? 'passed' : 'failed',
      summary: invalid.length === 0
        ? `${identityServices.length} advertisements have bound identities`
        : `${invalid.length} advertisements violate the identity contract`,
      details: {invalid: invalid.map(service => service.name)},
    };
  },
});

runner.registerProbe({
  id: 'headless-provisioning-contract',
  title: 'Headless identity assignment has typed proof and admin evidence',
  run: () => {
    const required = [
      'UvcIdentityAssignment',
      'UvcDeviceIdentityProof',
      'UvcDeviceIdentityCertificate',
      'UvcAdminRoleGrant',
    ];
    const recipes = new Map(UVC_RECIPES.map(recipe => [String(recipe.name), recipe]));
    const missing = required.filter(name => !recipes.has(name));
    const leakedPrivateFields = required.flatMap(name => (
      recipes.get(name)?.rule
        .map(rule => rule.itemprop)
        .filter(field => /private|secret/i.test(field))
        .map(field => `${name}.${field}`) ?? []
    ));
    return {
      status: missing.length === 0 && leakedPrivateFields.length === 0 ? 'passed' : 'failed',
      summary: missing.length
        ? `missing provisioning recipes: ${missing.join(', ')}`
        : leakedPrivateFields.length
          ? `private material appears in wire recipes: ${leakedPrivateFields.join(', ')}`
          : 'assignment, key proof, certificate, and admin grant are typed without private material',
      details: {missing, leakedPrivateFields},
    };
  },
});

runner.registerProbe({
  id: 'native-peer-presence',
  title: 'Cube, Expo, Groov and ESP32 advertise the shared service',
  run: () => {
    const seen = new Set(services.map(service => service.txt.deviceType).filter(Boolean));
    const missing = expectedKinds.filter(kind => !seen.has(kind));
    return {
      status: missing.length === 0 ? 'passed' : 'failed',
      summary: missing.length === 0
        ? `all expected peers are visible: ${expectedKinds.join(', ')}`
        : `missing mDNS device types: ${missing.join(', ')}`,
      details: {seen: [...seen], services},
    };
  },
});

runner.registerProbe({
  id: 'esp32-firmware-contract',
  title: 'Deployable ESP32 firmware preserves identity and fails closed',
  run: () => {
    const required = [
      ['bootstrap service', /_uvc-provision/],
      ['assigned Person', /personId/],
      ['assigned device kind', /deviceType/],
      ['durable public identity', /uvc_identity/],
      ['legacy credential rejection', /Rejected legacy unauthenticated credential service/],
      ['unauthenticated ceremony rejection', /Rejected unauthenticated UVC provisioning datagram/],
    ];
    const missing = required.filter(([, pattern]) => !pattern.test(esp32Firmware)).map(([name]) => name);
    const forbidden = [
      ['credential erased on boot', /DELETE VERIFIABLE CREDENTIAL ON BOOT/],
      ['owned mDNS silent mode', /quicvc_mdns_stop\s*\(\s*\)\s*;\s*\/\/\s*Silent mode/],
    ].filter(([, pattern]) => pattern.test(esp32Firmware)).map(([name]) => name);
    return {
      status: missing.length === 0 && forbidden.length === 0 ? 'passed' : 'failed',
      summary: missing.length || forbidden.length
        ? `ESP32 contract violations: ${[...missing, ...forbidden].join(', ')}`
        : 'bootstrap/assigned mDNS is stateful, identity is durable, and insecure ownership fails closed',
      details: {firmwareRoot: esp32FirmwareRoot, missing, forbidden},
    };
  },
});

const report = await runner.run({
  skipContracts: true,
  skipTransports: true,
  skipVerification: true,
});
const reportDirectory = path.resolve('tests/integration/reports');
await fs.mkdir(reportDirectory, {recursive: true});
const reportPath = path.join(reportDirectory, `uvc-protocol-${report.timestamp}.json`);
await fs.writeFile(reportPath, JSON.stringify({scanMs, expectedKinds, services, report}, null, 2));
console.log(QARunner.formatReport(report));
console.log(`Evidence: ${reportPath}`);
process.exitCode = report.summary.passed ? 0 : 1;

async function browse(durationMs) {
  const bonjour = new Bonjour();
  const found = new Map();
  const browsers = [
    ['one-refinio', bonjour.find({type: 'one-refinio', protocol: 'udp'})],
    ['uvc-provision', bonjour.find({type: 'uvc-provision', protocol: 'udp'})],
  ];
  const update = serviceType => service => {
    const txt = Object.fromEntries(Object.entries(service.txt ?? {}).map(([key, value]) => [
      key,
      Buffer.isBuffer(value) ? value.toString('utf8') : String(value),
    ]));
    const id = txt.deviceId ?? txt.hardwareDeviceId ?? service.name;
    found.set(id, {
      serviceType,
      name: service.name,
      host: service.host,
      port: service.port,
      addresses: service.addresses ?? [],
      txt,
    });
  };
  for (const [serviceType, browser] of browsers) {
    browser.on('up', update(serviceType));
    browser.on('txt-update', update(serviceType));
  }
  await new Promise(resolve => setTimeout(resolve, durationMs));
  for (const [, browser] of browsers) browser.stop();
  bonjour.destroy();
  return [...found.values()];
}

async function readEsp32FirmwareContract(root) {
  const files = [
    'main/main.c',
    'components/quicvc_mdns/quicvc_mdns.c',
    'components/quicvc_mdns/include/quicvc_mdns.h',
  ];
  return (await Promise.all(files.map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n');
}
