import { db } from './server';

// Aspect ratios (width / height) of the bundled demo media, measured from the
// actual files. Posts store one ratio per media item so the UI can reserve the
// exact space and never crop a photo unexpectedly.
const demoAspect: Record<string, number> = {
  coast: 1400/2100, alpine: 1400/2100, japan: 1400/2100, surf: 1400/2100,
  architecture: 1400/2100, road: 1400/933, india: 1400/2100, coffee: 1400/2100,
  flowers: 960/540,
};

export async function seed(){
  const database=db();if(await database.prepare("SELECT id FROM profiles WHERE id='demo_anaya'").first())return;
  const now=Date.now();
  const users=[
    ['anaya','anaya.explores','Anaya Mehra','Collecting places, little details, and a little sunlight.','avatar-1.jpg'],
    ['james','james.wilson','James Wilson','Out of office. Somewhere in the mountains.','avatar-2.jpg'],
    ['maya','maya.kapoor','Maya Kapoor','A camera and an endlessly curious mind.','avatar-3.jpg'],
    ['leo','leo.travels','Leo Bennett','Taking the scenic route.','avatar-4.jpg'],
    ['emily','emily.chen','Emily Chen','Good coffee. Beautiful spaces. Slow mornings.','avatar-5.jpg'],
    ['noah','noah.bennett','Noah Bennett','Chasing waves and the last light.','avatar-6.jpg'],
    ['priya','priya.verma','Priya Verma','Small moments from a big beautiful world.','avatar-7.jpg'],
    ['isabella','isabella.rios','Isabella Rios','Light, lines, and everyday stories.','avatar-8.jpg'],
  ];
  const content=[
    ['coast','anaya','A little color, a little sea, and nowhere else to be. ☀️ #italy #travel','Cinque Terre, Italy','Travel',2438],
    ['alpine','james','Some places make you forget to check your phone. #mountains #nature','The Alps','Nature',1856],
    ['japan','maya','Getting a little lost is always part of the plan. #japan #streetphotography','Japan','Photography',927],
    ['surf','noah','One more wave before the sun goes down. #ocean #slowliving','By the ocean','Nature',1204],
    ['architecture','isabella','Finding a different perspective in the everyday. #architecture #design','City wanderings','Architecture',683],
    ['road','leo','The long way home. Always. #roadtrip #adventure','On the road','Travel',1652],
    ['india','priya','A postcard from a place I never want to leave. #india #explore','India','Travel',2147],
    ['coffee','emily','Making time for the little rituals. ☕ #coffee #weekend','A quiet corner','Lifestyle',842],
  ];
  const statements=users.map((u,i)=>database.prepare('INSERT OR IGNORE INTO profiles (id,username,name,bio,avatar,is_demo,created_at) VALUES (?,?,?,?,?,1,?)').bind('demo_'+u[0],u[1],u[2],u[3],'/media/'+u[4],now-100000000+i));
  content.forEach((c,i)=>{statements.push(database.prepare('INSERT OR IGNORE INTO posts (id,author_id,media,media_type,kind,caption,location,category,base_likes,created_at,aspects) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind('demo_'+c[0],'demo_'+c[1],JSON.stringify(['/media/'+c[0]+'.jpg']),'image','post',c[2],c[3],c[4],c[5],now-(i+1)*7200000,JSON.stringify([demoAspect[c[0]]])));
    if(i<7)statements.push(database.prepare('INSERT OR IGNORE INTO posts (id,author_id,media,media_type,kind,caption,location,category,base_likes,created_at,expires_at,aspects) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind('story_'+c[0],'demo_'+c[1],JSON.stringify(['/media/'+c[0]+'.jpg']),'image','story',c[3],c[3],c[4],0,now-(i+1)*1200000,now+86400000,JSON.stringify([demoAspect[c[0]]])));
  });
  [['coast','maya','Those colors! Adding this to my list.'],['coast','leo','The kind of view you never get tired of.'],['alpine','anaya','This is my sign to book a mountain trip.'],['coffee','priya','The perfect way to start a day.']].forEach((c,i)=>statements.push(database.prepare('INSERT OR IGNORE INTO comments (id,post_id,author_id,body,created_at) VALUES (?,?,?,?,?)').bind('demo_comment_'+i,'demo_'+c[0],'demo_'+c[1],c[2],now-5000000+i)));
  statements.push(database.prepare('INSERT OR IGNORE INTO posts (id,author_id,media,media_type,kind,caption,location,category,base_likes,created_at,aspects) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind('demo_flowers','demo_emily',JSON.stringify(['/media/flowers.mp4']),'video','reel','A few seconds of stillness. 🌸 #nature #littlethings','In the garden','Nature',318,now-80000000,JSON.stringify([demoAspect.flowers])));
  await database.batch(statements);
}
