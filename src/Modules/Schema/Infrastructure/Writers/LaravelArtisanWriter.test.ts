import { describe, it, expect } from 'bun:test'
import { parseStubContext, applyStubContext } from './LaravelArtisanWriter'

const L8_STUB = `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Database\\Eloquent\\Model;

class User extends Model
{
    use HasFactory;
}
`

const CUSTOM_NS_STUB = `<?php

namespace App\\Domain\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class Product extends Model
{
}
`

describe('parseStubContext', () => {
  it('extracts namespace from L8 stub', () => {
    const ctx = parseStubContext(L8_STUB, '/path/to/User.php')
    expect(ctx.namespace).toBe('App\\Models')
  })

  it('extracts HasFactory trait from L8 stub', () => {
    const ctx = parseStubContext(L8_STUB, '/path/to/User.php')
    expect(ctx.existingTraits).toContain('HasFactory')
  })

  it('extracts custom namespace', () => {
    const ctx = parseStubContext(CUSTOM_NS_STUB, '/path/to/Product.php')
    expect(ctx.namespace).toBe('App\\Domain\\Models')
  })

  it('returns empty traits when class body has none', () => {
    const ctx = parseStubContext(CUSTOM_NS_STUB, '/path/to/Product.php')
    expect(ctx.existingTraits).toHaveLength(0)
  })

  it('stores filePath', () => {
    const ctx = parseStubContext(L8_STUB, '/var/www/app/Models/User.php')
    expect(ctx.filePath).toBe('/var/www/app/Models/User.php')
  })

  it('falls back to App\\Models when namespace regex fails', () => {
    const ctx = parseStubContext('<?php // no namespace', '/path/file.php')
    expect(ctx.namespace).toBe('App\\Models')
  })
})
