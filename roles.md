# Roles and Certificate Management in Flexibel

## Overview

The Flexibel application implements a hierarchical role-based access control system using digital certificates for authentication and authorization. This system is built on a decentralized trust model using public key cryptography and certificate attestation.

## Certificate-Based Trust Model

### Root of Trust

The system is anchored by **Root of Trust Public Signing Keys** configured in the application:

```json
{
  "rootOfTrustPublicSignKey": [
    "3b02e0337bfecf85ebe96e63f6faf6bd9199aa099c3e1b07c9ac930dc2f72bec",
    "afb4e2c33a017d8a6fa4ce66d2f0218a2f891c6d2873703c384981633785faf0"
  ]
}
```

These keys serve as the ultimate trust anchors for the entire system. Any profile or identity containing these keys is considered a trusted authority.

### Certificate Types

The system uses several types of certificates for different purposes:

#### 1. AffirmationCertificate
- **Purpose**: Affirms that referenced data contains accurate information
- **Structure**: References a data hash and includes a license
- **License Text**: "[signature.issuer] affirms that content of [data] is correct"
- **Use Case**: Used to establish trust in profiles and their contained information

#### 2. TrustKeysCertificate
- **Purpose**: Establishes trust relationships between keys/profiles
- **Use Case**: Used to create chains of trust from the root of trust to individual users

#### 3. RelationCertificate
- **Purpose**: Establishes relationships between entities (e.g., doctor-patient relationships)
- **Use Case**: Used for role assignments and relationship verification

#### 4. Access Control Certificates
- **AccessVersionedObjectCertificate**: Controls access to versioned objects
- **AccessUnversionedObjectCertificate**: Controls access to unversioned objects

#### 5. Special Authority Certificates
- **RightToDeclareTrustedKeysForEverybodyCertificate**: Grants authority to declare keys trusted for all users
- **RightToDeclareTrustedKeysForSelfCertificate**: Grants authority to declare keys trusted for oneself

## Role Hierarchy

### Administrative Roles

#### Admin Role
- **Model**: `AdminRoleModel`
- **Authority**: Root-level administrative access
- **Capabilities**:
  - Can create Doctor, Patient, and Therapist roles
  - Has access to all system functions
  - Can manage trust relationships
- **Trust Mechanism**: Based on SignKey authentication using root of trust keys

#### Legacy Admin Model
- **Model**: `AdminModel` (appears to be legacy, single root key)
- **Trust Verification**: Uses AffirmationCertificates signed by root of trust

### Medical Professional Roles

#### Doctor Role
- **Model**: `DoctorRoleModel`
- **Relation**: "Doctor of flexibel"
- **Capabilities**:
  - Can create Therapist and Patient roles
  - Has access to patient data through established relationships
- **Trust Mechanism**: Relation-based, issued by Admin or other authorized Doctors

#### Therapist Role
- **Model**: `TherapistRoleModel`
- **Relation**: "Therapist of flexibel"
- **Capabilities**:
  - Can create Patient roles
  - Has limited access compared to Doctors
- **Trust Mechanism**: Relation-based, issued by Admin or Doctors

### Patient Role
- **Model**: `PatientRoleModel`
- **Relation**: "patient of flexibel"
- **Capabilities**:
  - Cannot create other roles
  - Can access own data and questionnaires
  - Can share specific data channels with authorized medical professionals
- **Data Channels**: 
  - Questionnaire responses
  - Body temperature measurements
  - Diary entries
  - White blood cell differential counts
  - Documents
- **Trust Mechanism**: Relation-based, issued by Admin, Doctors, or Therapists

## Trust Establishment Process

### 1. Initial Trust
1. System administrators manually configure root of trust public keys
2. Profiles containing these keys are automatically trusted as system authorities

### 2. Certificate Issuance
1. Trusted authorities issue certificates to establish new trust relationships
2. For role assignments, RelationCertificates are created specifying the relationship type
3. For data accuracy, AffirmationCertificates are issued

### 3. Trust Verification
1. When verifying trust, the system traces certificate chains back to root of trust
2. Each certificate in the chain must be properly signed and valid
3. Trust is transitive through the certificate chain

### 4. Access Control
1. Access to objects and data is controlled through access certificates
2. Role-based permissions determine what certificates a user can issue
3. Data sharing is managed through channel-based access control

## Security Features

### Digital Signatures
- All certificates are digitally signed using private keys
- Public key verification ensures certificate authenticity
- Signature verification is performed against trusted key chains

### Certificate Validation
- Certificates are validated against their schema definitions
- License compliance is checked for each certificate type
- Expiration and revocation status can be verified

### Access Control
- Granular permissions based on certificate types and roles
- Channel-based data compartmentalization
- Explicit access grants required for data sharing

## Transition to Verifiable Credentials

As the system evolves to support **Verifiable Credentials (VCs)**, the following migration path is planned:

### Current State
- Certificate-based trust with proprietary formats
- Role definitions tied to specific certificate types
- Trust anchored to configured public keys

### Future State with VCs
- **W3C Verifiable Credentials standard compliance**
- **DID (Decentralized Identifier) integration** for identity management
- **Schema-based credential definitions** for standardized role attestation
- **Selective disclosure** capabilities for privacy-enhanced data sharing
- **Interoperability** with external healthcare systems using VC standards

### Migration Considerations
1. **Credential Schema Mapping**: Map existing certificate types to VC schemas
2. **DID Integration**: Establish DID methods for identity resolution
3. **Trust Registry**: Migrate root of trust to a VC-compatible trust registry
4. **Backward Compatibility**: Ensure existing certificates remain valid during transition
5. **Revocation Mechanisms**: Implement VC revocation lists or status checking

## Data Flow and Channel Management

### Patient Data Channels
Patients automatically share the following data channels with their assigned medical professionals:
- **QuestionnaireModel.channelId**: Survey responses and assessments
- **BodyTemperatureModel.channelId**: Temperature measurements
- **DiaryModel.channelId**: Patient diary entries
- **WbcDiffModel.channelId**: Laboratory results
- **DocumentModel.channelId**: Medical documents and files

### Access Patterns
1. **Patient-Initiated**: Patients can grant access to their data channels
2. **Role-Based**: Medical professionals receive access based on their assigned roles
3. **Relationship-Dependent**: Access is tied to established doctor-patient or therapist-patient relationships

## Implementation Notes

### Certificate Storage
- Certificates are stored as cryptographically verifiable objects
- Each certificate has a unique hash identifier
- Certificate chains can be traversed for trust verification

### Role Assignment Process
1. Authorized issuer creates a RelationCertificate
2. Certificate specifies the relationship type and involved parties
3. Role model validates the issuer's authority to create the relationship
4. Access permissions are automatically granted based on role capabilities

### Trust Cache Management
- Trust relationships are cached for performance
- Cache invalidation occurs when new certificates are issued
- Periodic refresh ensures up-to-date trust status

---

This document provides the foundation for understanding the current certificate-based role system and preparing for the integration of W3C Verifiable Credentials standards. 