import { fullName, initials } from '../lib/format';

type Person = {id: number; name: string; surname?: string; hasAvatar?: boolean; avatarVersion?: number};

export function Avatar({person, className = 'user-avatar'}: {person: Person; className?: string}) {
  return <span className={className} aria-hidden="true">
    {person.hasAvatar ? <img src={`/api/users/${person.id}/avatar${person.avatarVersion ? `?v=${person.avatarVersion}` : ''}`} alt=""/> : initials({name: person.name, surname: person.surname ?? ''})}
  </span>;
}

export function avatarLabel(person: Person) { return `${fullName({name: person.name, surname: person.surname ?? ''})} profil fotoğrafı`; }
