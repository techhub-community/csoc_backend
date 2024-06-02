from rest_framework import serializers

from teams.models import Team
from users.models import CustomUser

from .models import Invitation


class InvitationSerializer(serializers.ModelSerializer):
    receiver = serializers.PrimaryKeyRelatedField(queryset=CustomUser.objects.all())
    team = serializers.PrimaryKeyRelatedField(queryset=Team.objects.all())

    class Meta:
        model = Invitation
        fields = ['id', 'sender', 'receiver', 'team', 'status']