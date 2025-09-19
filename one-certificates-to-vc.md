# Evolving ONE Platform Certificates to Verifiable Credentials

## Current State

### Message Signatures (Already Implemented as VCs)
- `MessageSignature` objects store Ed25519 signatures
- Can be reconstructed into W3C Verifiable Credentials
- Used for proving message authenticity and creating message chains

### ONE Platform Certificates (Need VC Evolution)
The ONE platform uses a three-part certificate system:

1. **License** - Describes what is being certified
2. **Certificate** - Links to data and license
3. **Signature** - Cryptographic proof from issuer

Certificate types include:
- `AffirmationCertificate` - Affirms data accuracy
- `TrustKeysCertificate` - Verifies key ownership  
- `AccessUnversionedObjectCertificate` - Grants access rights
- `RelationCertificate` - Establishes relationships

## Design: ONE Certificates as Verifiable Credentials

### Core Concept
Transform the three-part ONE certificate structure into a single VC that maintains all the properties while adding W3C standards compliance.

### VC Structure for ONE Certificates

```typescript
interface ONECertificateVC {
  '@context': [
    'https://www.w3.org/2018/credentials/v1',
    'https://one.refinio.com/2024/certificates/v1'
  ];
  type: ['VerifiableCredential', 'ONECertificate', string]; // e.g., 'AffirmationCertificate'
  id: string; // Certificate hash
  issuer: string; // did:one:{personIdHash}
  issuanceDate: string;
  
  credentialSubject: {
    // Core certificate data
    data: string; // Hash of data being certified
    license: {
      type: string; // Certificate type from ONE
      description: string; // Human-readable license text
      permissions?: string[]; // For access certificates
      constraints?: any; // Additional license constraints
    };
    
    // Certificate-specific fields
    // For TrustKeysCertificate:
    profile?: string; // Profile hash
    keys?: {
      publicSignKey: string;
      publicEncryptionKey: string;
    };
    
    // For AccessCertificate:
    grantedTo?: string; // Person ID who receives access
    object?: string; // Object hash being granted access to
    
    // For RelationCertificate:
    relation?: {
      type: string; // Relation type
      from: string; // Person ID
      to: string; // Person ID
    };
  };
  
  proof: {
    type: 'Ed25519Signature2020';
    created: string;
    verificationMethod: string; // did:one:{issuerPersonId}#keys-1
    proofPurpose: 'assertionMethod';
    proofValue: string; // Base64 Ed25519 signature
  };
}
```

### Integration with TrustedKeysManager

```typescript
class VCTrustedKeysManager extends TrustedKeysManager {
  /**
   * Create a certificate as a Verifiable Credential
   */
  async certifyAsVC(
    certificateType: string,
    data: { data: SHA256Hash; [key: string]: any },
    issuerPersonId: SHA256IdHash<Person>
  ): Promise<{
    vc: ONECertificateVC;
    certificateHash: SHA256Hash;
  }> {
    // Get issuer's crypto API
    const cryptoApi = await createCryptoApiFromDefaultKeys(issuerPersonId);
    
    // Create VC structure
    const vc: ONECertificateVC = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://one.refinio.com/2024/certificates/v1'
      ],
      type: ['VerifiableCredential', 'ONECertificate', certificateType],
      id: '', // Will be set after hashing
      issuer: `did:one:${issuerPersonId}`,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        data: data.data.toString(),
        license: {
          type: certificateType,
          description: this.getLicenseDescription(certificateType),
          ...this.extractLicenseData(certificateType, data)
        },
        ...this.extractCertificateData(certificateType, data)
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `did:one:${issuerPersonId}#keys-1`,
        proofPurpose: 'assertionMethod',
        proofValue: '' // Will be set after signing
      }
    };
    
    // Sign the VC
    const vcWithoutProof = { ...vc };
    delete vcWithoutProof.proof.proofValue;
    const canonicalVC = canonicalize(vcWithoutProof);
    const vcHash = await sha256(canonicalVC);
    const signature = await cryptoApi.sign(vcHash);
    
    vc.proof.proofValue = base64Encode(signature);
    
    // Store the VC
    const vcObject = {
      $type$: 'VerifiableCredentialCertificate',
      vc: vc
    };
    const result = await storeUnversionedObject(vcObject);
    
    vc.id = `did:one:certificate:${result.hash}`;
    
    // Also create traditional ONE certificate for backward compatibility
    await this.certify(certificateType, data, issuerPersonId);
    
    return {
      vc,
      certificateHash: result.hash
    };
  }
  
  /**
   * Verify a VC certificate
   */
  async verifyVCCertificate(vc: ONECertificateVC): Promise<boolean> {
    // Extract issuer Person ID from DID
    const issuerMatch = vc.issuer.match(/^did:one:([a-f0-9]{64})$/);
    if (!issuerMatch) return false;
    
    const issuerPersonId = issuerMatch[1] as SHA256IdHash<Person>;
    
    // Get issuer's public key
    const keysHash = await getDefaultKeys(issuerPersonId);
    const keys = await getObject(keysHash);
    
    // Verify signature
    const vcWithoutProof = { ...vc };
    delete vcWithoutProof.proof.proofValue;
    const canonicalVC = canonicalize(vcWithoutProof);
    const vcHash = await sha256(canonicalVC);
    
    return nacl.sign.detached.verify(
      vcHash,
      base64Decode(vc.proof.proofValue),
      keys.publicSignKey
    );
  }
}
```

### Migration Strategy

1. **Dual Support Phase**
   - Extend TrustedKeysManager with VC methods
   - Create both traditional certificates and VCs
   - UI shows VC data when available

2. **Transition Phase**
   - New certificates created only as VCs
   - Legacy certificates can be viewed but not created
   - Tools to convert existing certificates to VCs

3. **VC-Only Phase**
   - Remove traditional certificate creation
   - All certificates are VCs
   - Full W3C standards compliance

### Benefits

1. **Standards Compliance** - W3C Verifiable Credentials standard
2. **Interoperability** - Can be verified by external VC tools
3. **Self-Contained** - Single object contains all certificate data
4. **Future-Proof** - Ready for DID methods and VC ecosystems
5. **Maintains ONE Properties** - Trust chains and relationships preserved

### Next Steps

1. Create `VerifiableCredentialCertificate` recipe
2. Extend TrustedKeysManager with VC methods
3. Update certificate UI components to display VCs
4. Test with existing certificate use cases