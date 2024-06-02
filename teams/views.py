from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from membership.models import Membership

from .models import Team
from .serializers import TeamSerializer


class ListCreateTeamAPIView(generics.ListCreateAPIView):
    queryset = Team.objects.all()
    serializer_class = TeamSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        team = serializer.save()
        Membership.objects.create(user=self.request.user, team=team, role=self.request.user.role)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
