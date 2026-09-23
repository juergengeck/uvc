import {describe, expect, it, jest} from '@jest/globals';
import {hasRole, UvcRole} from '../role-utils';

function roleCertificate(trusted: boolean, role = UvcRole.ADMIN, app = 'uvc') {
  return {
    trusted,
    certificate: {
      $type$: 'RoleCertificate',
      person: 'person-1',
      role,
      app,
      license: 'license-hash',
    },
  };
}

describe('role authorization', () => {
  it('accepts only a trusted matching role certificate', async () => {
    const getCertificatesOfType = jest.fn(async () => [
      roleCertificate(false),
      roleCertificate(true, UvcRole.ADMIN, 'vger'),
      roleCertificate(true, UvcRole.OPERATOR),
    ]);
    const leuteModel = {trust: {getCertificatesOfType}};

    await expect(hasRole(leuteModel as never, 'person-1' as never, UvcRole.ADMIN)).resolves.toBe(false);
    await expect(hasRole(leuteModel as never, 'person-1' as never, UvcRole.ADMIN, 'vger')).resolves.toBe(true);
    await expect(hasRole(leuteModel as never, 'person-1' as never, UvcRole.OPERATOR)).resolves.toBe(true);
  });
});
