from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated


from .models import CustomUser
from .serializers import UserRegistrationSerializer, UserListSerializer


class UserRegistrationAPIView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [AllowAny]
 

class ListUsersAPIView(generics.ListAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserListSerializer
