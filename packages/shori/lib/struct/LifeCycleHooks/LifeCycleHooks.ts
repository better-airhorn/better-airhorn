export interface OnInit {
	shOnInit(): any;
}

export interface OnReady {
	shOnReady(): any;
}

export interface OnPermissionsMissing {
	shOnPermissionsMissing(): void;
}
