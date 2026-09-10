export type Person={id:string;username:string;name:string;bio:string;avatar:string;is_demo:number;followers:number;following:number;post_count:number;followed:number};
export type Post={id:string;author_id:string;media:string[];media_type:'image'|'video';kind:'post'|'reel'|'story';caption:string;location:string;category:string;created_at:number;expires_at:number|null;likes:number;liked:number;saved:number;seen:number;comment_count:number;author:Person};
export type Comment={id:string;post_id:string;author_id:string;body:string;created_at:number;username:string;avatar:string};
export type Message={id:string;sender_id:string;recipient_id:string;body:string;created_at:number;read_at:number|null};
export type Notification={id:string;actor_id:string;kind:string;post_id:string|null;created_at:number;read_at:number|null;username:string;avatar:string;media:string|null};
export type SocialData={me:Person|null;people:Person[];posts:Post[];notifications:Notification[];unreadMessages:number;hasMore:boolean};
