import { Association, DataTypes, HasManyAddAssociationMixin, HasManyAddAssociationsMixin, HasManyCountAssociationsMixin, HasManyCreateAssociationMixin, HasManyGetAssociationsMixin, HasManyHasAssociationMixin, Model } from "sequelize";
import { Insult } from "./InsultModel";

interface SubmitterAttributes {
    sid: number,
    userid: string | null,
    free: boolean,
    authcode: string
}

interface SubmitterCreationAttributes { }

export class Submitter extends Model<SubmitterAttributes, SubmitterCreationAttributes> implements SubmitterAttributes {
    public sid!: number;
    public userid!: string | null;
    public free!: boolean;
    public authcode!: string;

    public readonly insults?: Insult[];
    public getInsults!: HasManyGetAssociationsMixin<Insult>;
    public countInsults!: HasManyCountAssociationsMixin;
    public createInsult!: HasManyCreateAssociationMixin<Insult>;

    public readonly registeredAt!: Date;
}