# Database Seeder

## Overview

Database seeder for pre-populating the Ibibina system with test users. This seeder creates users for all roles: Admin, Chairperson, Financial, and Members.

## Seeded Users

### Admin User
- **Email**: admin@ibibina.rw
- **Password**: Admin@123
- **Role**: Admin
- **Status**: Active

### Chairperson
- **Name**: Jean Uwimana
- **Phone**: +250788123456
- **PIN**: 123456
- **Role**: Chairperson
- **Status**: Active

### Financial Officer
- **Name**: Marie Mukamana
- **Phone**: +250788234567
- **PIN**: 234567
- **Role**: Financial
- **Status**: Active

### Members
1. **Claude Niyonzima** - +250788345678 - PIN: 345678
2. **Grace Uwase** - +250788456789 - PIN: 456789
3. **Eric Habimana** - +250788567890 - PIN: 567890

## Usage

### Seed Users (Skip Existing)
```bash
npm run seed
```
This command will create all users if they don't already exist.

### Clear All Users
```bash
npm run seed:clear
```
⚠️ **Warning**: This will delete all users from the database.

### Refresh (Clear and Re-seed)
```bash
npm run seed:refresh
```
This will remove all existing users and create fresh seed data.

## Database Configuration

Ensure your `.env` file has the correct database connection settings:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=your_db_user
DB_PASSWORD=your_db_password
DB_DATABASE=ibibina
DB_SYNCHRONIZE=true
```

## Files

- `src/database/seed.ts` - Main seeder CLI script
- `src/database/seeder.module.ts` - Seeder module configuration
- `src/modules/users/users.seeder.ts` - User seeder service

## Customization

To add more seed users, edit `src/modules/users/users.seeder.ts` and add entries to the `seedUsers` array.

### Example: Adding a New Member

```typescript
{
  firstName: 'New',
  lastName: 'Member',
  phone: '+250788999999',
  pin: '999999',
  role: UserRole.MEMBER,
  status: UserStatus.ACTIVE,
}
```

## Notes

- Admin users authenticate with **email + password**
- Non-admin users authenticate with **phone + 6-digit PIN**
- The seeder automatically hashes passwords and PINs before storing
- Duplicate identifiers (email/phone) are skipped automatically
